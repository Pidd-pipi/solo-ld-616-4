/**
 * 全局配置分散经过 .env / docker-compose / 此处读取。
 * 数据库连接为生命周期持久化的唯一存储；DB 不可用时启动直接失败，绝不回退到内存存储。
 */
export const config = {
  port: Number(process.env.PORT ?? 3000),
  db: {
    host: process.env.DB_HOST ?? "localhost",
    port: Number(process.env.DB_PORT ?? 5432),
    database: process.env.DB_NAME ?? "app_db",
    user: process.env.DB_USER ?? "app_user",
    password: process.env.DB_PASSWORD ?? "app_password",
    // 启动重试：配合 compose 的 service_healthy 与本地直接运行两种场景。
    connectRetries: Number(process.env.DB_CONNECT_RETRIES ?? 10),
    connectRetryDelayMs: Number(process.env.DB_CONNECT_RETRY_DELAY_MS ?? 1000)
  },
  jwtSecret: process.env.JWT_SECRET ?? "local-dev-secret"
};
