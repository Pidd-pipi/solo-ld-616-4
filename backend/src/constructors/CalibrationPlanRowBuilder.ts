import type { CalibrationPlan } from "../models/CalibrationPlan";

/**
 * 校准计划行构造器：service 不得散写默认结构。
 */
export const buildCalibrationPlanRow = (
  input: Partial<CalibrationPlan> & Pick<CalibrationPlan, "id" | "device_id">
): CalibrationPlan => ({
  id: input.id,
  device_id: input.device_id,
  planned_date: input.planned_date ?? new Date().toISOString(),
  plan_type: input.plan_type ?? "PERIODIC",
  priority: input.priority ?? "MEDIUM",
  status: input.status ?? "PLANNED",
  assigned_vendor_id: input.assigned_vendor_id ?? 0,
  created_by: input.created_by ?? "system"
});
