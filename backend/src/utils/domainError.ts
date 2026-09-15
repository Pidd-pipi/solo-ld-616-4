/**
 * 服务层领域异常。service 抛出，controller 二次包装后交给全局异常中间件。
 */
export class DomainError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "DomainError";
    this.status = status;
    this.code = code;
  }
}

export const notFound = (code: string, message: string): DomainError => new DomainError(404, code, message);

export const conflict = (code: string, message: string): DomainError => new DomainError(409, code, message);

export const badRequest = (code: string, message: string): DomainError => new DomainError(400, code, message);

/**
 * 简易 %s 模板填充，配合 constants/errorMessages 中的模板使用。
 */
export const formatMessage = (template: string, ...args: Array<string | number>): string =>
  template.replace(/%s/g, () => String(args.shift() ?? ""));
