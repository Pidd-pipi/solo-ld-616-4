import type { RequestHandler } from "express";
import { isDatabaseReady, getDatabaseState } from "../repositories/databaseState";
import { ERROR_CODES } from "../constants/errorCodes";
import { ERROR_MESSAGES } from "../constants/errorMessages";
import { retryablePersistence } from "../utils/domainError";

/**
 * 数据库就绪门：未就绪时（启动中或连接丢失），所有 /api 读写直接返回可重试的 503，
 * 并提示 Retry-After；进程保持存活，数据库恢复后自动放行，已有数据不受影响。
 * /health 不经过此门，便于外部同时探测进程与数据库状态。
 */
export const databaseReadyMiddleware: RequestHandler = (_req, res, next) => {
  if (isDatabaseReady()) {
    next();
    return;
  }
  const { lastError } = getDatabaseState();
  res.setHeader("Retry-After", "2");
  next(
    retryablePersistence(
      ERROR_CODES.DATABASE_NOT_READY,
      `${ERROR_MESSAGES.DATABASE_NOT_READY} (${lastError})`
    )
  );
};
