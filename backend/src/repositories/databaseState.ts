import { pool, isRetryableDatabaseError } from "./db";
import { bootstrapDatabase } from "./schema";
import { config } from "../config/env";

/**
 * 数据库就绪状态机。
 *
 * 进程绝不因为数据库暂时不可用而退出：HTTP 服务先启动，bootstrap 在后台无限重试；
 * 数据库恢复后自动完成建表与幂等种子（不覆盖已有数据），随后所有接口自动恢复。
 *
 * 状态：
 * - initializing：尚未完成首次引导（数据库未启动/正在建表）
 * - ready：已就绪，可正常读写
 * - degraded：曾经就绪后连接丢失（池会自动重连，探测恢复后重新置为 ready）
 */
export type DatabaseState = "initializing" | "ready" | "degraded";

let state: DatabaseState = "initializing";
let lastError = "not connected yet";
let bootstrapping: Promise<void> | null = null;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const getDatabaseState = (): { state: DatabaseState; lastError: string } => ({ state, lastError });

export const isDatabaseReady = (): boolean => state === "ready";

/**
 * 单次连通性探测。连接错误视为暂时性；其它 SQL 错误说明数据库可达。
 */
const ping = async (): Promise<boolean> => {
  try {
    await pool.query("SELECT 1 AS ok");
    return true;
  } catch (err) {
    lastError = err instanceof Error ? err.message : String(err);
    if (isRetryableDatabaseError(err)) {
      return false;
    }
    // 数据库可达但 SQL 报错（例如尚未建表）——视为可继续 bootstrap。
    return true;
  }
};

/**
 * 后台引导循环：先等连通，再幂等建表/种子。任何失败都只改变状态并重试，不抛出、不退出进程。
 */
export const startDatabaseBootstrap = (): void => {
  if (bootstrapping) {
    return;
  }
  bootstrapping = (async () => {
    // 首次失败后的重试间隔可配置；连接丢失恢复后也走同一循环。
    for (;;) {
      const connected = await ping();
      if (connected) {
        if (state !== "ready") {
          // 仅在首次启动或从掉线恢复时执行幂等建表/种子，不覆盖已有数据。
          try {
            await bootstrapDatabase();
            console.info("[db] bootstrap complete, database is ready");
            state = "ready";
          } catch (err) {
            lastError = err instanceof Error ? err.message : String(err);
            // 建表/种子过程中数据库掉线 -> degraded，继续重试；未提交不会残留半成品。
            state = "degraded";
            console.error("[db] bootstrap failed, will retry:", lastError);
          }
        }
      } else if (state === "ready") {
        state = "degraded";
        console.error("[db] connection lost, serving retryable errors until it recovers");
      }

      if (state === "ready") {
        // 就绪后持续轻量探测；掉线置 degraded，恢复时回到上面的 bootstrap 分支。
        await sleep(config.db.readyProbeIntervalMs);
        if (!(await ping())) {
          state = "degraded";
          console.error("[db] connection lost (probe), serving retryable errors until it recovers");
        }
      } else {
        await sleep(config.db.connectRetryDelayMs);
      }
    }
  })();
  // 不让后台循环的 reject 变成未处理异常；循环内部已捕获全部错误。
  bootstrapping.catch(() => undefined);
};
