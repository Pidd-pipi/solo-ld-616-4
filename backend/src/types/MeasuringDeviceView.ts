import type { DeviceCalibrationStatus } from "../constants/DeviceCalibrationStatus";
import type { DeviceLifecycleStatus } from "../constants/DeviceLifecycleStatus";
import type { DeviceLifecycleRecord } from "../models/DeviceLifecycleRecord";

/**
 * 台账查询统一视图：同时返回生命周期、校准状态和最近一次生命周期变更记录。
 */
export interface MeasuringDeviceView {
  id: number;
  device_code: string;
  name: string;
  device_type: string;
  accuracy_level: string;
  owner_dept: string;
  calibration_cycle_days: number;
  status: DeviceCalibrationStatus;
  lifecycle_status: DeviceLifecycleStatus;
  exempt_reason: string | null;
  exempt_until: string | null;
  last_lifecycle_change: DeviceLifecycleRecord | null;
}
