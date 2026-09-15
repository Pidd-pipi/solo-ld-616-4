import type { QueryResultRow } from "pg";
import { query, withTransaction, clientQuery, type DbClient } from "./db";

export interface IdempotencyReplay {
  statusCode: number;
  body: unknown;
}

/**
 * tryAcquire 的判定结果：
 * - owner：本请求成为持有者（新占位或接管了失联持有者的过期租约），可以执行业务；
 * - completed：首次结果已登记，直接重放；
 * - locked：存在存活持有者（业务事务持行锁，或租约仍新鲜），本请求转为跟随等待。
 */
export type AcquireMode =
  | { mode: "owner" }
  | { mode: "completed"; replay: IdempotencyReplay }
  | { mode: "locked" };

interface IdempotencyRow extends QueryResultRow {
  scope: string;
  idempotency_key: string;
  status_code: number;
  response: unknown;
  owner_token: string | null;
  leased_at: Date | null;
  completed_at: Date | null;
}

const SELECT_COLUMNS =
  "scope, idempotency_key, status_code, response, owner_token, leased_at, completed_at";

const isFreshLease = (leasedAt: Date | null, nowMs: number, ttlMs: number): boolean =>
  !!leasedAt && nowMs - leasedAt.getTime() < ttlMs;

/**
 * 幂等记录仓储，按调用范围 (scope, idempotency_key) 隔离，并支持持有者失联后的安全接管。
 *
 * 关键不变量：
 * 1. 业务写入与结果登记在持有者的同一个数据库事务内提交 —— 不存在“业务已提交但结果未登记”；
 * 2. 持有者执行期间对占位行持有 FOR UPDATE 行锁并按 TTL 心跳续租；
 * 3. 跟随者用 FOR UPDATE SKIP LOCKED 非阻塞探测：行被锁或租约新鲜则等待，
 *    仅当持有者失联（行无锁且租约过期）才接管，因此不会同时执行两次；
 * 4. 崩溃在业务提交前 -> 业务事务回滚、行锁释放、租约到期后被接管，重跑到唯一结果；
 *    崩溃在提交时 -> 业务与结果同生共灭，跟随者要么读到已完成结果要么整体重来。
 */
export const idempotencyRepository = {
  /**
   * 占位（独立短事务提交，使其它实例可见）。已存在则不插入。
   */
  insertReservationIfAbsent: async (
    scope: string,
    key: string,
    ownerToken: string,
    nowIso: string
  ): Promise<void> => {
    await query(
      `INSERT INTO idempotency_record (scope, idempotency_key, status_code, response, owner_token, leased_at)
       VALUES ($1, $2, 0, 'null'::jsonb, $3, $4)
       ON CONFLICT (scope, idempotency_key) DO NOTHING`,
      [scope, key, ownerToken, nowIso]
    );
  },

  /**
   * 非阻塞抢占/接管（独立短事务，SKIP LOCKED 绝不等待存活持有者）。
   */
  tryAcquire: async (
    scope: string,
    key: string,
    ownerToken: string,
    nowIso: string,
    ttlMs: number
  ): Promise<AcquireMode> =>
    withTransaction(async (client: DbClient): Promise<AcquireMode> => {
      const result = await clientQuery<IdempotencyRow>(
        client,
        `SELECT ${SELECT_COLUMNS} FROM idempotency_record
         WHERE scope = $1 AND idempotency_key = $2 FOR UPDATE SKIP LOCKED`,
        [scope, key]
      );
      const row = result.rows[0];
      if (!row) {
        // 行被另一事务锁定（持有者正在业务事务内）。
        return { mode: "locked" };
      }
      if (Number(row.status_code) > 0) {
        return {
          mode: "completed",
          replay: { statusCode: Number(row.status_code), body: row.response }
        };
      }
      if (row.owner_token === ownerToken) {
        return { mode: "owner" };
      }
      const nowMs = new Date(nowIso).getTime();
      if (isFreshLease(row.leased_at, nowMs, ttlMs)) {
        // 持有者未持锁但租约新鲜（处于事务间隙且仍在心跳）——不接管。
        return { mode: "locked" };
      }
      // 持有者失联：行无锁且租约过期，安全接管为新持有者。
      await clientQuery(
        client,
        `UPDATE idempotency_record
           SET owner_token = $3, leased_at = $4, status_code = 0, response = 'null'::jsonb,
               completed_at = NULL
         WHERE scope = $1 AND idempotency_key = $2 AND status_code = 0`,
        [scope, key, ownerToken, nowIso]
      );
      return { mode: "owner" };
    }),

  /**
   * 持有者业务事务内：先锁定属于自己的占位行并复检。
   * 返回 null 表示在抢占后、开事务前被他人接管/已完成（调用方应退化为跟随者）。
   */
  lockForOwner: async (
    client: DbClient,
    scope: string,
    key: string,
    ownerToken: string
  ): Promise<IdempotencyRow | null> => {
    const result = await clientQuery<IdempotencyRow>(
      client,
      `SELECT ${SELECT_COLUMNS} FROM idempotency_record
       WHERE scope = $1 AND idempotency_key = $2 FOR UPDATE`,
      [scope, key]
    );
    const row = result.rows[0];
    if (!row || row.owner_token !== ownerToken) {
      return null;
    }
    return row;
  },

  /**
   * 登记最终结果。必须在持有者的业务事务内调用，与业务写入同一事务提交/回滚。
   */
  completeWithin: async (
    client: DbClient,
    scope: string,
    key: string,
    ownerToken: string,
    statusCode: number,
    body: unknown,
    nowIso: string
  ): Promise<void> => {
    await clientQuery(
      client,
      `UPDATE idempotency_record
         SET status_code = $3, response = $4, completed_at = $5, leased_at = $5
       WHERE scope = $1 AND idempotency_key = $2 AND owner_token = $6 AND status_code = 0`,
      [scope, key, statusCode, JSON.stringify(body), nowIso, ownerToken]
    );
  },

  /**
   * 业务失败时释放仍是自己的未完成占位，允许同接口同 key 立即作为新请求重试。
   */
  release: async (scope: string, key: string, ownerToken: string): Promise<void> => {
    await query(
      `DELETE FROM idempotency_record
       WHERE scope = $1 AND idempotency_key = $2 AND owner_token = $3 AND status_code = 0`,
      [scope, key, ownerToken]
    );
  },

  /**
   * 跟随者快速回读已完成的首次结果。
   */
  readCompleted: async (scope: string, key: string): Promise<IdempotencyReplay | null> => {
    const result = await query<IdempotencyRow>(
      `SELECT ${SELECT_COLUMNS} FROM idempotency_record
       WHERE scope = $1 AND idempotency_key = $2 AND status_code > 0`,
      [scope, key]
    );
    const row = result.rows[0];
    return row ? { statusCode: Number(row.status_code), body: row.response } : null;
  }
};
