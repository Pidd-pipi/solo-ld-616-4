import type { ErrorRequestHandler } from "express";
import { DomainError } from "../utils/domainError";

/**
 * 全局异常处理。可重试错误（典型：数据库暂时不可用）额外给出 retryable 与 Retry-After，
 * 进程不退出，调用方稍后重试即可；控制器已二次包装的 DomainError 在此统一出参。
 */
export const errorHandlerMiddleware: ErrorRequestHandler = (err, _req, res, _next) => {
  const status = err instanceof DomainError ? err.status : err.status ?? 500;
  const code = err instanceof DomainError ? err.code : err.code ?? "INTERNAL_ERROR";
  const retryable = err instanceof DomainError ? err.retryable : false;

  if (retryable) {
    res.setHeader("Retry-After", "2");
  }
  res.status(status).json({
    code,
    message: err.message,
    ...(retryable ? { retryable: true } : {})
  });
};
