import { randomUUID } from "crypto";
import type { Request } from "express";
import { idempotencyRepository, type AcquireMode } from "../repositories/IdempotencyRepository";
import { withTransaction, type DbClient } from "../repositories/db";
import { config } from "../config/env";
import { ERROR_CODES } from "../constants/errorCodes";
import { ERROR_MESSAGES } from "../constants/errorMessages";
import { DomainError, retryablePersistence } from "./domainError";

export interface WriteOutcome {
  statusCode: number;
  body: unknown;
}

/** 在业务事务内执行实际写入；返回值与结果登记在同一事务提交。 */
export type TransactionalWorker = (client: DbClient) => Promise<WriteOutcome>;

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

const nowIso = (): string => new Date().toISOString();

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * 跟随者：等待持有者提交首次结果。
 * 等待期间不断尝试非阻塞抢占/接管；持有者存活时只等待不接管，
 * 持有者失联（行锁释放且租约过期）时自己接管成为新持有者；
 * 读到已完成结果则立即重放。
 */
const followOrTakeOver = async (
  scope: string,
  key: string,
  ownerToken: string,
  deadline: number
): Promise<{ kind: "replay"; outcome: WriteOutcome } | { kind: "owner" }> => {
  const { leaseTtlMs, pollIntervalMs } = config.idempotency;
  while (Date.now() < deadline) {
    // 快路径：结果是否已登记。
    const completed = await idempotencyRepository.readCompleted(scope, key).catch(() => null);
    if (completed) {
      return { kind: "replay", outcome: completed };
    }
    // 慢路径：非阻塞探测是否可以接管失联持有者。
    const acquired: AcquireMode = await idempotencyRepository.tryAcquire(
      scope,
      key,
      ownerToken,
      nowIso(),
      leaseTtlMs
    );
    if (acquired.mode === "completed") {
      return { kind: "replay", outcome: acquired.replay };
    }
    if (acquired.mode === "owner") {
      return { kind: "owner" };
    }
    await sleep(pollIntervalMs);
  }
  throw new DomainError(
    409,
    ERROR_CODES.IDEMPOTENCY_REPLAY_PENDING,
    `${ERROR_MESSAGES.IDEMPOTENCY_REPLAY_PENDING} key=${key}`
  );
};

/**
 * 持有者：在单个事务内（1）复检占位归属（2）执行业务（3）登记结果，三者同提交同回滚。
 */
const runAsOwner = async (
  scope: string,
  key: string,
  ownerToken: string,
  worker: TransactionalWorker,
  prepare?: () => Promise<unknown>
): Promise<WriteOutcome> => {
  // prepare（如豁免到期恢复）在业务事务前以独立事务提交，避免持锁过久。
  if (prepare) {
    await prepare();
  }

  return withTransaction(async (client) => {
    const owned = await idempotencyRepository.lockForOwner(client, scope, key, ownerToken);
    if (!owned) {
      // 在抢占后、开事务前被他人接管或结果已登记：让外层按跟随者重放，绝不执行业务。
      throw retryablePersistence(
        ERROR_CODES.IDEMPOTENCY_REPLAY_PENDING,
        `idempotency ownership changed, retry to read back first result key=${key}`
      );
    }

    if (Number(owned.status_code) > 0) {
      return { statusCode: Number(owned.status_code), body: owned.response };
    }

    const outcome = await worker(client);
    await idempotencyRepository.completeWithin(
      client,
      scope,
      key,
      ownerToken,
      outcome.statusCode,
      outcome.body,
      nowIso()
    );
    return outcome;
  });
};

/**
 * 写接口幂等运行器（带崩溃接管）。
 * - 带 Idempotency-Key：按 (scope, key) 去重；持有者失联后租约过期可被安全接管，
 *   业务与结果同事务提交，保证“不执行两次、不产生两条、首次结果可回读”。
 * - 不同 scope 的同 key 互不影响（跨接口隔离）。
 * - 不带 key：在单事务内直接执行 worker。
 */
export const runIdempotent = async (
  req: Request,
  scopeLabel: string,
  worker: TransactionalWorker,
  prepare?: () => Promise<unknown>
): Promise<WriteOutcome> => {
  void scopeLabel; // 仅用于调用处可读性，实际隔离范围由请求路由派生。
  const key = req.header("Idempotency-Key");

  if (!key) {
    if (prepare) {
      await prepare();
    }
    return withTransaction((client) => worker(client));
  }

  const scope = resolveIdempotencyScope(req);
  const ownerToken = randomUUID();
  await idempotencyRepository.insertReservationIfAbsent(scope, key, ownerToken, nowIso());

  let acquired: AcquireMode = await idempotencyRepository.tryAcquire(
    scope,
    key,
    ownerToken,
    nowIso(),
    config.idempotency.leaseTtlMs
  );

  // 抢占者可能正好是占位插入者；若插入后被更早的持有者占据则转为跟随。
  if (acquired.mode === "locked" || acquired.mode === "completed") {
    if (acquired.mode === "completed") {
      return acquired.replay;
    }
    const followed = await followOrTakeOver(
      scope,
      key,
      ownerToken,
      Date.now() + config.idempotency.waitTimeoutMs
    );
    if (followed.kind === "replay") {
      return followed.outcome;
    }
    acquired = { mode: "owner" };
  }

  try {
    return await runAsOwner(scope, key, ownerToken, worker, prepare);
  } catch (err) {
    // 归属变化（被接管/已完成）：转为跟随读回首次结果，而不是报错。
    if (err instanceof DomainError && err.code === ERROR_CODES.IDEMPOTENCY_REPLAY_PENDING) {
      const followed = await followOrTakeOver(
        scope,
        key,
        ownerToken,
        Date.now() + config.idempotency.waitTimeoutMs
      );
      if (followed.kind === "replay") {
        return followed.outcome;
      }
      // 已接管为新持有者，递归执行一次（同一 key 最多一次接管递归）。
      return runAsOwner(scope, key, ownerToken, worker, undefined);
    }

    // 业务失败（4xx/5xx）：业务事务已整体回滚；释放仍是自己的未完成占位，
    // 允许同接口同 key 修正后作为新请求重试。
    await idempotencyRepository.release(scope, key, ownerToken).catch(() => undefined);
    throw err;
  }
};
