export const createMeasuringDeviceDto = (overrides = {}) => ({
  id: 1,
  device_code: "device code 1",
  name: "name 1",
  device_type: "DUE_SOON",
  accuracy_level: "LOW",
  owner_dept: "owner dept 1",
  calibration_cycle_days: 365,
  status: "VALID",
  lifecycle_status: "ACTIVE",
  exempt_reason: null,
  exempt_until: null,
  ...overrides
});
