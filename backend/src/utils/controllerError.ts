import { DomainError } from "./domainError";

/**
 * 控制器层异常二次包装：service 抛 DomainError，controller 不吞掉，
 * 统一加上来源标记后交给全局 errorHandlerMiddleware。
 */
export const wrapControllerError = (err: unknown, scope: string): Error => {
  if (err instanceof DomainError) {
    return new DomainError(err.status, err.code, `[${scope}] ${err.message}`);
  }
  if (err instanceof Error) {
    return err;
  }
  return new Error(`[${scope}] unknown controller error`);
};
