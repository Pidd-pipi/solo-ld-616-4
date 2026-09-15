/**
 * 全局配置分散经过 .env / docker-compose / 此处读取。
 * 数据库连接为生命周期持久化的唯一存储；DB 不可用时进程不退出，
 * 后台引导循环持续重试，恢复后自动继续，绝不回退到内存存储。
 */
export const config = {
  port: Number(process.env.PORT ?? 3000),
  db: {
    host: process.env.DB_HOST ?? "localhost",
    port: Number(process.env.DB_PORT ?? 5432),
    database: process.env.DB_NAME ?? "app_db",
    user: process.env.DB_USER ?? "app_user",
    password: process.env.DB_PASSWORD ?? "app_password",
    // 未就绪/掉线后的后台重试间隔（无限重试，进程不退出）。
    connectRetryDelayMs: Number(process.env.DB_CONNECT_RETRY_DELAY_MS ?? 1000),
    // 就绪后的探活间隔，用于发现运行中数据库掉线并在恢复后自动转回 ready。
    readyProbeIntervalMs: Number(process.env.DB_READY_PROBE_INTERVAL_MS ?? 3000)
  },
  idempotency: {
    // 占位租约时长：仅覆盖“抢占提交后到业务事务拿到行锁”的毫秒级间隙；
    // 业务执行期间由 FOR UPDATE 行锁权威守护，租约过期判断在持锁期间不会发生。
    // 持有者进程在该间隙崩溃时，他人需等租约过期后安全接管（此时尚未发生任何业务写入）。
    leaseTtlMs: Number(process.env.IDEMPOTENCY_LEASE_TTL_MS ?? 15000),
    // 跟随者等待首次结果的最长时间，超时返回可重试 409。
    waitTimeoutMs: Number(process.env.IDEMPOTENCY_WAIT_TIMEOUT_MS ?? 30000),
    // 跟随者轮询间隔。
    pollIntervalMs: Number(process.env.IDEMPOTENCY_POLL_INTERVAL_MS ?? 200)
  },
  jwtSecret: process.env.JWT_SECRET ?? "local-dev-secret"
};
