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
  jwtSecret: process.env.JWT_SECRET ?? "local-dev-secret"
};
