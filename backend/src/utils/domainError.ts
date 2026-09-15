/**
 * 服务层领域异常。service 抛出，controller 二次包装后交给全局异常中间件。
 * retryable=true 表示故障为暂时性（如数据库连接中断），调用方稍后重试即可成功。
 */
export class DomainError extends Error {
  readonly status: number;
  readonly code: string;
  readonly retryable: boolean;

  constructor(status: number, code: string, message: string, retryable = false) {
    super(message);
    this.name = "DomainError";
    this.status = status;
    this.code = code;
    this.retryable = retryable;
  }
}

export const notFound = (code: string, message: string): DomainError => new DomainError(404, code, message);

export const conflict = (code: string, message: string): DomainError => new DomainError(409, code, message);

export const badRequest = (code: string, message: string): DomainError => new DomainError(400, code, message);

/**
 * 可重试的持久化故障（典型：数据库连接中断）。进程保持存活，调用方按 Retry-After 重试。
 */
export const retryablePersistence = (code: string, message: string): DomainError =>
  new DomainError(503, code, message, true);

/**
 * 简易 %s 模板填充，配合 constants/errorMessages 中的模板使用。
 */
export const formatMessage = (template: string, ...args: Array<string | number>): string =>
  template.replace(/%s/g, () => String(args.shift() ?? ""));
