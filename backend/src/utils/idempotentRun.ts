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
 * 写接口幂等运行器。
 * - 带 Idempotency-Key：同 key 的重复/并发请求只让一个请求执行写库，其余重放首次结果，
 *   绝不产生第二条相同记录（PostgreSQL 主键唯一约束保证）。
 * - 业务成功提交后才登记可重放响应；业务失败则删除占位，后续同 key 可作为新请求重试。
 * - 业务规则错误（4xx）本身不会写入任何数据（业务事务回滚），占位随之释放。
 * - 不带 key：退化为普通执行，原有入口与校验不变。
 */
export const runIdempotent = async (
  req: Request,
  scope: string,
  worker: () => Promise<WriteOutcome>
): Promise<WriteOutcome> => {
  const key = req.header("Idempotency-Key");
  if (!key) {
    return worker();
  }

  const mode = await idempotencyRepository.reserve(key, scope);
  if (mode === "replay") {
    try {
      return await idempotencyRepository.waitForResult(key);
    } catch {
      // 首个请求仍在执行或异常中断（业务若已提交也不会被此处重复执行）。
      throw new DomainError(
        409,
        ERROR_CODES.IDEMPOTENCY_REPLAY_PENDING,
        `${ERROR_MESSAGES.IDEMPOTENCY_REPLAY_PENDING} key=${key}`
      );
    }
  }

  try {
    const outcome = await worker();
    // 先确保业务已随 worker 内事务提交，再把响应登记为可重放。
    await idempotencyRepository.complete(key, outcome.statusCode, outcome.body);
    return outcome;
  } catch (err) {
    // 业务失败：释放占位，允许调用方修正后用同一 key 重试；业务事务已回滚，无脏数据。
    await idempotencyRepository.release(key).catch(() => undefined);
    throw err;
  }
};
