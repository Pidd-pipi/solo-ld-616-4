import type { QueryResultRow } from "pg";
import { query, withTransaction, type DbClient } from "./db";

export interface IdempotencyReplay {
  statusCode: number;
  body: unknown;
}

/**
 * 写接口幂等记录，按调用范围隔离。
 *
 * 主键为 (scope, idempotency_key)：
 * - scope 标识具体写接口（HTTP 方法 + 路由，如 POST:/api/measuring-device/:id/exempt）；
 * - 同一 scope 下重复/并发提交同一 key：只执行一次写库，其余重放首次结果；
 * - 不同 scope（如设备建档 vs 豁免）即使 key 相同也互不影响，不会串用结果。
 *
 * 三阶段（各自独立短事务，避免长事务持锁）：
 * 1. reserve  插入占位（复合主键唯一），抢到者执行，其他请求进入重放等待；
 * 2. worker  业务写在其自身事务内提交（与本记录解耦）；
 * 3. complete/release 成功则登记可重放响应，失败则删除占位允许后续重试。
 */
export const idempotencyRepository = {
  reserve: async (scope: string, key: string): Promise<"acquired" | "replay"> =>
    withTransaction(async (client: DbClient) => {
      const inserted = await client.query(
        `INSERT INTO idempotency_record (scope, idempotency_key, status_code, response)
         VALUES ($1, $2, 0, 'null'::jsonb) ON CONFLICT (scope, idempotency_key) DO NOTHING`,
        [scope, key]
      );
      return inserted.rowCount === 1 ? "acquired" : "replay";
    }),

  /**
   * 重放方在同一 scope 内轮询首个请求登记的结果；只读取，绝不重执行业务。
   */
  waitForResult: async (scope: string, key: string): Promise<IdempotencyReplay> => {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const result = await query<QueryResultRow>(
        `SELECT status_code, response FROM idempotency_record
         WHERE scope = $1 AND idempotency_key = $2`,
        [scope, key]
      );
      const row = result.rows[0];
      if (row && Number(row.status_code) > 0) {
        return { statusCode: Number(row.status_code), body: row.response };
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error("idempotent result not available in time");
  },

  complete: async (scope: string, key: string, statusCode: number, body: unknown): Promise<void> => {
    await withTransaction(async (client: DbClient) => {
      await client.query(
        `UPDATE idempotency_record SET status_code = $3, response = $4
         WHERE scope = $1 AND idempotency_key = $2`,
        [scope, key, statusCode, JSON.stringify(body)]
      );
    });
  },

  release: async (scope: string, key: string): Promise<void> => {
    await withTransaction(async (client: DbClient) => {
      await client.query(
        `DELETE FROM idempotency_record WHERE scope = $1 AND idempotency_key = $2`,
        [scope, key]
      );
    });
  }
};
