export const createCalibrationPlanDto = (overrides = {}) => ({
  id: 1,
  device_id: 1,
  planned_date: "2026-06-11T09:00:00Z",
  plan_type: "PERIODIC",
  priority: "MEDIUM",
  status: "PLANNED",
  assigned_vendor_id: 1,
  created_by: "created by 1",
  ...overrides
});
