import EmbeddedPostgres from "embedded-postgres";
import path from "node:path";
import fs from "node:fs";

/**
 * 测试夹具常量：嵌入式 PostgreSQL 15 是真实的 postgres 进程 + 持久数据目录，
 * 不是内存替身也不是单连接串行化；应用经普通 TCP 连接访问，行锁/接管/断库恢复都会真实发生。
 */
export const PG_PORT = 55432;
export const PG_USER = "app_user";
export const PG_PASSWORD = "app_password";
export const PG_DATABASE = "app_db";
export const BACKEND_PORT = 21199;
export const BACKEND_URL = `http://127.0.0.1:${BACKEND_PORT}`;

export const SERVER_ENV = {
  PORT: String(BACKEND_PORT),
  DB_HOST: "127.0.0.1",
  DB_PORT: String(PG_PORT),
  DB_NAME: PG_DATABASE,
  DB_USER: PG_USER,
  DB_PASSWORD: PG_PASSWORD,
  // 让断库恢复与租约接管在测试中足够快（语义不变，只是等待更短）。
  DB_CONNECT_RETRY_DELAY_MS: "500",
  DB_READY_PROBE_INTERVAL_MS: "1000",
  IDEMPOTENCY_LEASE_TTL_MS: "700",
  IDEMPOTENCY_WAIT_TIMEOUT_MS: "3000",
  IDEMPOTENCY_POLL_INTERVAL_MS: "50"
} as const;

const TMP_DIR = path.resolve(__dirname, "..", ".tmp");
export const PGDATA_DIR = path.join(TMP_DIR, "pgdata");
export const BACKEND_LOG = path.join(TMP_DIR, "backend.log");

export interface PgClusterHandle {
  start: () => Promise<void>;
  stop: () => Promise<void>;
}

/**
 * 启动真实 PostgreSQL 集群。fresh=true 时清空数据目录（每轮测试从干净库开始），
 * 测试过程中的 stop/start 复用同一目录，以验证“断库恢复后数据不变”。
 */
export const startPgCluster = async (fresh: boolean): Promise<EmbeddedPostgres> => {
  fs.mkdirSync(TMP_DIR, { recursive: true });
  if (fresh) {
    fs.rmSync(PGDATA_DIR, { recursive: true, force: true });
  }
  const pg = new EmbeddedPostgres({
    databaseDir: PGDATA_DIR,
    user: PG_USER,
    password: PG_PASSWORD,
    port: PG_PORT,
    persistent: true
  });
  const needsInit = !fs.existsSync(PGDATA_DIR) || fs.readdirSync(PGDATA_DIR).length === 0;
  if (needsInit) {
    await pg.initialise();
  }
  await pg.start();
  try {
    await pg.createDatabase(PG_DATABASE);
  } catch {
    // 库已存在（重启场景），忽略。
  }
  return pg;
};

export const pgConnectionConfig = {
  host: "127.0.0.1",
  port: PG_PORT,
  database: PG_DATABASE,
  user: PG_USER,
  password: PG_PASSWORD
} as const;
