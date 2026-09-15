import type { QueryResultRow } from "pg";
import { query, withTransaction, type DbClient } from "./db";

export interface IdempotencyReplay {
  statusCode: number;
  body: unknown;
}

/**
 * 写接口幂等记录。同一 Idempotency-Key 的重复请求重放首次结果，
 * 业务副作用只执行一次，绝不插入第二条设备/计划/生命周期记录。
 *
 * 三阶段（各自独立短事务，避免长事务持锁）：
 * 1. reserve  插入占位（唯一索引），抢到者执行，其他请求进入重放等待；
 * 2. worker  业务写在其自身事务内提交（与本记录解耦）；
 * 3. complete/ release 成功则登记可重放响应，失败则删除占位允许后续重试。
 */
export const idempotencyRepository = {
  reserve: async (key: string, scope: string): Promise<"acquired" | "replay"> =>
    withTransaction(async (client: DbClient) => {
      const inserted = await client.query(
        `INSERT INTO idempotency_record (idempotency_key, scope, status_code, response)
         VALUES ($1, $2, 0, 'null'::jsonb) ON CONFLICT (idempotency_key) DO NOTHING`,
        [key, scope]
      );
      return inserted.rowCount === 1 ? "acquired" : "replay";
    }),

  /**
   * 重放方轮询首个请求登记的结果（其业务事务提交后才会写入 status_code>0）。
   * 只读取、绝不重执行业务，因此即使首请求在登记结果前崩溃，也不会产生第二条记录。
   */
  waitForResult: async (key: string): Promise<IdempotencyReplay> => {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const result = await query<QueryResultRow>(
        `SELECT status_code, response FROM idempotency_record WHERE idempotency_key = $1`,
        [key]
      );
      const row = result.rows[0];
      if (row && Number(row.status_code) > 0) {
        return { statusCode: Number(row.status_code), body: row.response };
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error("idempotent result not available in time");
  },

  complete: async (key: string, statusCode: number, body: unknown): Promise<void> => {
    await withTransaction(async (client: DbClient) => {
      await client.query(
        `UPDATE idempotency_record SET status_code = $2, response = $3 WHERE idempotency_key = $1`,
        [key, statusCode, JSON.stringify(body)]
      );
    });
  },

  release: async (key: string): Promise<void> => {
    await withTransaction(async (client: DbClient) => {
      await client.query(`DELETE FROM idempotency_record WHERE idempotency_key = $1`, [key]);
    });
  }
};
