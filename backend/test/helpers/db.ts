import { Pool, Client } from "pg";
import { randomUUID } from "node:crypto";
import { pgConnectionConfig } from "./config";

/**
 * 测试专用的独立连接池：与应用子进程的连接池是不同连接，
 * 读回的数据是真正落库的结果；真实停库/重启后连接池会自动剔除死连接并重连
 * （单 Client 断连不会自愈，无法覆盖断库恢复），行锁用例再用 openClient 真持锁。
 */
export const openDb = (): Pool =>
  new Pool({ ...pgConnectionConfig, max: 4, connectionTimeoutMillis: 3000 });

/** 专用单连接：跨 BEGIN...FOR UPDATE...COMMIT 真实持有行锁（连接池 client 归还后锁即释放）。 */
export const openClient = (): Client => new Client(pgConnectionConfig);

export type DbConn = Pool | Client;

export const one = async <T = any>(conn: DbConn, sql: string, params: unknown[] = []): Promise<T> =>
  withRetry(async () => {
    const result = await conn.query(sql, params as never[]);
    return result.rows[0] as T;
  }, sql);

export const count = async (conn: DbConn, sql: string, params: unknown[] = []): Promise<number> =>
  withRetry(async () => {
    const row = (await conn.query(sql, params as never[])).rows[0] as { n: string };
    return Number(row.n);
  }, sql);

export const rows = async <T = any>(conn: DbConn, sql: string, params: unknown[] = []): Promise<T[]> =>
  withRetry(async () => {
    const result = await conn.query(sql, params as never[]);
    return result.rows as T[];
  }, sql);

/**
 * PG 重启后连接池里可能残留一条死连接，首次查询报错、丢弃后下一条即重连成功。
 * 仅对连接类错误短暂重试，业务错误不吞。
 */
const withRetry = async <T>(fn: () => Promise<T>, label: string): Promise<T> => {
  const deadline = Date.now() + 8000;
  let lastErr: unknown;
  while (Date.now() < deadline) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const code = (err as { code?: string })?.code ?? "";
      const msg = (err as Error)?.message ?? "";
      const connectionError =
        code.startsWith("08") ||
        ["57P01", "57P02", "57P03", "53300"].includes(code) ||
        /ECONNREFUSED|terminated|EPIPE|ETIMEDOUT/i.test(msg);
      if (!connectionError) {
        throw err;
      }
      await sleep(150);
    }
  }
  throw new Error(`db read failed after reconnect retries [${label}]: ${String(lastErr)}`);
};

/** 每轮运行唯一前缀：同一套测试连续多次运行，键/编码互不冲突，结果稳定可重复。 */
export const runId = (): string =>
  `${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}-${randomUUID().slice(0, 8)}`;

export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
