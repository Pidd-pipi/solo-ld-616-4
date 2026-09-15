import { Pool, PoolClient, QueryResult, QueryResultRow } from "pg";
import { config } from "../config/env";
import { ERROR_CODES } from "../constants/errorCodes";
import { ERROR_MESSAGES } from "../constants/errorMessages";
import { DomainError } from "../utils/domainError";

/**
 * 全局 PostgreSQL 连接池。所有实体的唯一持久化存储，进程内不再保留业务可变状态。
 */
export const pool = new Pool({
  host: config.db.host,
  port: config.db.port,
  database: config.db.database,
  user: config.db.user,
  password: config.db.password,
  max: 20
});

/**
 * 任意数据库读/写失败统一包装成 PERSISTENCE_FAILED（503），
 * service 不允许在写库失败时仅改内存后报告成功。
 */
export const mapDbError = (err: unknown, scope: string): DomainError => {
  const detail = err instanceof Error ? err.message : String(err);
  const wrapped = new DomainError(
    503,
    ERROR_CODES.PERSISTENCE_FAILED,
    `${ERROR_MESSAGES.PERSISTENCE_FAILED} [${scope}]: ${detail}`
  );
  // 保留底层 pg 错误（含 SQLSTATE），供上层把唯一约束冲突等映射为 409。
  (wrapped as DomainError & { cause?: unknown }).cause = err;
  return wrapped;
};

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
    // 连接获取失败（如数据库不可达）同样包装为明确的持久化错误。
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

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * 启动时等待数据库就绪；重试耗尽后抛出，调用方以非零码退出。
 */
export const waitForDatabase = async (): Promise<void> => {
  let lastError: unknown;
  for (let attempt = 1; attempt <= config.db.connectRetries; attempt += 1) {
    try {
      const result = await pool.query("SELECT 1 AS ok");
      if (result.rows[0]?.ok === 1) {
        return;
      }
    } catch (err) {
      lastError = err;
      console.warn(
        `[db] waiting for postgres (${attempt}/${config.db.connectRetries}) ${config.db.host}:${config.db.port}/${config.db.database}`
      );
      await sleep(config.db.connectRetryDelayMs);
    }
  }
  throw mapDbError(lastError ?? new Error("database unreachable"), "waitForDatabase");
};

export const closeDatabase = async (): Promise<void> => {
  await pool.end();
};
