import { ERROR_CODES } from "../constants/errorCodes";
import { ERROR_MESSAGES } from "../constants/errorMessages";
import { badRequest } from "../utils/domainError";

const parseId = (raw: unknown): number => {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    throw badRequest(ERROR_CODES.VALIDATION_FAILED, `${ERROR_MESSAGES.VALIDATION_FAILED}: id`);
  }
  return id;
};

const requireNonEmptyString = (raw: unknown, field: string): string => {
  if (typeof raw !== "string" || raw.trim() === "") {
    throw badRequest(ERROR_CODES.VALIDATION_FAILED, `${ERROR_MESSAGES.VALIDATION_FAILED}: ${field}`);
  }
  return raw.trim();
};

const parseNow = (raw: unknown): string | undefined => {
  if (raw === undefined || raw === null) {
    return undefined;
  }
  const text = String(raw);
  if (Number.isNaN(Date.parse(text))) {
    throw badRequest(ERROR_CODES.VALIDATION_FAILED, `${ERROR_MESSAGES.VALIDATION_FAILED}: now`);
  }
  return new Date(text).toISOString();
};

/**
 * 路径参数 :id 校验。
 */
export const validateDeviceId = (raw: unknown): number => parseId(raw);

/**
 * 豁免入参：原因（非空字符串）和截止日（可解析日期，且晚于当前时间）。
 */
export const validateExemptBody = (
  body: Record<string, unknown>
): { reason: string; exempt_until: string; operated_by?: string; now?: string } => {
  const reason = requireNonEmptyString(body.reason, "reason");
  const exemptUntilRaw = requireNonEmptyString(body.exempt_until, "exempt_until");
  const exemptUntilMs = Date.parse(exemptUntilRaw);
  if (Number.isNaN(exemptUntilMs)) {
    throw badRequest(
      ERROR_CODES.VALIDATION_FAILED,
      `${ERROR_MESSAGES.VALIDATION_FAILED}: exempt_until`
    );
  }
  const now = parseNow(body.now);
  if (exemptUntilMs <= Date.parse(now ?? new Date().toISOString())) {
    throw badRequest(
      ERROR_CODES.VALIDATION_FAILED,
      `${ERROR_MESSAGES.VALIDATION_FAILED}: exempt_until must be in the future`
    );
  }
  return {
    reason,
    exempt_until: new Date(exemptUntilMs).toISOString(),
    operated_by: typeof body.operated_by === "string" ? body.operated_by : undefined,
    now
  };
};

/**
 * 报废入参：原因可选；now 可指定判定时间（主要用于测试到期恢复）。
 */
export const validateScrapBody = (
  body: Record<string, unknown> | null | undefined
): { reason?: string; operated_by?: string; now?: string } => {
  const safe = body ?? {};
  return {
    reason:
      typeof safe.reason === "string" && safe.reason.trim() !== "" ? safe.reason.trim() : undefined,
    operated_by: typeof safe.operated_by === "string" ? safe.operated_by : undefined,
    now: parseNow(safe.now)
  };
};

/**
 * 新建计划入参：device_id 必填且为正整数。
 */
export const validatePlanCreateBody = (
  body: Record<string, unknown>
): { device_id: number; [key: string]: unknown } => {
  const deviceId = Number(body.device_id);
  if (!Number.isInteger(deviceId) || deviceId <= 0) {
    throw badRequest(
      ERROR_CODES.VALIDATION_FAILED,
      `${ERROR_MESSAGES.VALIDATION_FAILED}: device_id`
    );
  }
  return { ...body, device_id: deviceId };
};
