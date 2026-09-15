export const ERROR_MESSAGES = {
  AUTH_REQUIRED: "missing bearer token",
  RBAC_DENIED: "role denied",
  VALIDATION_FAILED: "invalid payload",
  RATE_LIMITED: "too many requests",
  DEVICE_NOT_FOUND: "measuring device %s not found",
  DEVICE_ALREADY_SCRAPPED: "measuring device %s is already scrapped",
  DEVICE_ALREADY_EXEMPT: "measuring device %s is already exempt until %s",
  DEVICE_SCRAP_PLAN_CONFLICT: "measuring device %s has %s in-progress plan(s), scrap rejected",
  PLAN_DEVICE_SCRAPPED: "measuring device %s is scrapped, new calibration plan rejected",
  PLAN_DEVICE_EXEMPT: "measuring device %s is exempt until %s, new calibration plan rejected",
  DEVICE_CODE_DUPLICATED: "device_code %s already exists, duplicate create rejected",
  IDEMPOTENCY_REPLAY_PENDING: "identical request already submitted, first result not ready yet",
  PERSISTENCE_FAILED: "storage write failed, operation not persisted",
  DATABASE_NOT_READY: "database not ready, the service keeps running, please retry shortly"
};
