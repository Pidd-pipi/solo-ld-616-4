import type { Request } from "express";
import { idempotencyRepository } from "../repositories/IdempotencyRepository";
import { ERROR_CODES } from "../constants/errorCodes";
import { ERROR_MESSAGES } from "../constants/errorMessages";
import { DomainError } from "./domainError";

export interface WriteOutcome {
  statusCode: number;
  body: unknown;
}

/**
 * 调用范围 = HTTP 方法 + 命中的路由模式（如 POST:/api/measuring-device/:id/exempt）。
 * 不同写接口即不同 scope，即便复用同一个 Idempotency-Key 也互不串用；
 * 同一接口（含相同路由参数位置）同一 key 仍只执行一次。
 */
export const resolveIdempotencyScope = (req: Request): string => {
  const pattern = req.route?.path
    ? `${req.baseUrl}${req.route.path}`
    : `${req.baseUrl}${req.path}`;
  return `${req.method}:${pattern}`;
};

/**
 * 写接口幂等运行器。
 * - 带 Idempotency-Key：按 (scope, key) 去重，重复/并发请求只让一个请求执行写库，
 *   其余在同一 scope 内重放首次结果，绝不产生第二条记录；不同 scope 的同 key 互不影响。
 * - 业务成功提交后才登记可重放响应；业务失败则删除占位，后续同 key 可作为新请求重试。
 * - 不带 key：退化为普通执行，原有入口与校验不变。
 */
export const runIdempotent = async (
  req: Request,
  scopeLabel: string,
  worker: () => Promise<WriteOutcome>
): Promise<WriteOutcome> => {
  const key = req.header("Idempotency-Key");
  if (!key) {
    return worker();
  }
  const scope = resolveIdempotencyScope(req);
  void scopeLabel; // 仅用于调用处可读性，实际隔离范围由请求路由派生。

  const mode = await idempotencyRepository.reserve(scope, key);
  if (mode === "replay") {
    try {
      return await idempotencyRepository.waitForResult(scope, key);
    } catch {
      throw new DomainError(
        409,
        ERROR_CODES.IDEMPOTENCY_REPLAY_PENDING,
        `${ERROR_MESSAGES.IDEMPOTENCY_REPLAY_PENDING} key=${key}`
      );
    }
  }

  try {
    const outcome = await worker();
    // 先确保业务已随 worker 内事务提交，再把响应登记为该 scope 下可重放。
    await idempotencyRepository.complete(scope, key, outcome.statusCode, outcome.body);
    return outcome;
  } catch (err) {
    // 业务失败：仅释放本 scope 下的占位，允许同接口同 key 修正后重试；业务事务已回滚。
    await idempotencyRepository.release(scope, key).catch(() => undefined);
    throw err;
  }
};
