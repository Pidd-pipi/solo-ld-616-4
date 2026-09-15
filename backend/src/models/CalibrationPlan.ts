import type { PlanStatus } from "../constants/PlanStatus";

export interface CalibrationPlan {
  id: number;
  device_id: number;
  planned_date: string;
  plan_type: string;
  priority: string;
  status: PlanStatus;
  assigned_vendor_id: number;
  created_by: string;
}
