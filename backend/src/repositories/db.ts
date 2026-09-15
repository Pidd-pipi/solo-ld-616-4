import { Pool, PoolClient, QueryResult, QueryResultRow } from "pg";
import { config } from "../config/env";
import { ERROR_CODES } from "../constants/errorCodes";
import { ERROR_MESSAGES } from "../constants/errorMessages";
import { DomainError, retryablePersistence } from "../utils/domainError";

/**
 * 全局 PostgreSQL 连接池。所有实体的唯一持久化存储，进程内不保留业务可变状态。
 * 连接断开时由池自动重连，后端进程始终存活，不允许因为数据库暂时不可用而退出。
 */
export const pool = new Pool({
  host: config.db.host,
  port: config.db.port,
  database: config.db.database,
  user: config.db.user,
  password: config.db.password,
  max: 20
});

// 空闲连接发生错误（如数据库重启导致 idle client 被关闭）时仅记录，不能让未处理错误终止进程。
pool.on("error", (err) => {
  console.error("[db] idle client error (pool will reconnect):", err.message);
});

/**
 * 连接层 SQLSTATE：客户端无法连接/被踢出等暂时性故障，可重试。
 * 08xxx=连接异常，57P01=管理员关停，57P03=无法启动，08006/08004 等。
 */
const RETRYABLE_SQLSTATES = new Set([
  "08000", "08003", "08004", "08006", "08007", "08P01",
  "57P01", "57P02", "57P03", "53300"
]);

const isRetryablePgError = (err: unknown): boolean => {
  const e = err as { code?: string; message?: string } | null;
  if (!e || typeof e !== "object") {
    return false;
  }
  if (e.code && RETRYABLE_SQLSTATES.has(e.code)) {
    return true;
  }
  const message = e.message ?? "";
  return (
    /ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|EPIPE|ENETUNREACH|EHOSTUNREACH|connection terminated|Connection terminated|Connection terminated unexpectedly|timeout exceeded/i.test(
      message
    )
  );
};

/**
 * 数据库读/写失败统一包装：
 * - 连接中断等暂时性故障 -> 503 PERSISTENCE_FAILED，retryable=true（附 Retry-After）；
 * - 约束冲突、SQL 错误等非连接问题 -> 503 PERSISTENCE_FAILED，retryable=false，
 *   底层 pg 错误挂在 cause 上（含 SQLSTATE 23505，供唯一约束映射 409）。
 */
export const mapDbError = (err: unknown, scope: string): DomainError => {
  const detail = err instanceof Error ? err.message : String(err);
  const wrapped = retryablePersistence(
    ERROR_CODES.PERSISTENCE_FAILED,
    `${ERROR_MESSAGES.PERSISTENCE_FAILED} [${scope}]: ${detail}`
  );
  if (!isRetryablePgError(err)) {
    (wrapped as DomainError & { retryable: boolean }).retryable = false;
  }
  (wrapped as DomainError & { cause?: unknown }).cause = err;
  return wrapped;
};

/**
 * 判断错误是否为可重试的连接故障（供就绪探测使用）。
 */
export const isRetryableDatabaseError = (err: unknown): boolean => isRetryablePgError(err);

export const query = async <T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = []
): Promise<QueryResult<T>> => {
  try {
    return await pool.query(text, params as never[]);
  } catch (err) {
    throw mapDbError(err, text.slice(0, 48));
  }
};

export type DbClient = PoolClient;

/**
 * PostgreSQL unique_violation (SQLSTATE 23505)：用于把重复建档等唯一约束冲突映射成 409。
 */
export const isUniqueViolation = (err: unknown): boolean =>
  typeof err === "object" && err !== null && (err as { code?: string }).code === "23505";

/**
 * 事务回调内统一使用返回的 client，行锁（FOR UPDATE）仅在事务内有效。
 */
export const withTransaction = async <T>(fn: (client: DbClient) => Promise<T>): Promise<T> => {
  let client: DbClient;
  try {
    client = await pool.connect();
  } catch (err) {
    throw mapDbError(err, "pool.connect");
  }
  try {
    try {
      await client.query("BEGIN");
    } catch (err) {
      throw mapDbError(err, "BEGIN");
    }
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    // 业务 DomainError 与 clientQuery 已包装的持久化错误原样上抛。
    throw err;
  } finally {
    client.release();
  }
};

export const clientQuery = async <T extends QueryResultRow = QueryResultRow>(
  client: DbClient,
  text: string,
  params: unknown[] = []
): Promise<QueryResult<T>> => {
  try {
    return await client.query(text, params as never[]);
  } catch (err) {
    throw mapDbError(err, text.slice(0, 48));
  }
};

/**
 * 优雅关闭：停止接受新查询并关闭池内所有连接，供进程收到 SIGTERM/SIGINT 时退出。
 */
export const closePool = async (): Promise<void> => {
  await pool.end();
};
