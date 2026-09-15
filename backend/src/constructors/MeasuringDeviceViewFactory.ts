import type { MeasuringDevice } from "../models/MeasuringDevice";
import type { DeviceLifecycleRecord } from "../models/DeviceLifecycleRecord";
import type { MeasuringDeviceView } from "../types/MeasuringDeviceView";

/**
 * 台账查询响应构造器：原始设备行 + 最近一次生命周期变更记录 → 查询视图。
 * 视图同时暴露校准状态 status 与生命周期 lifecycle_status，二者独立维护。
 */
export const buildMeasuringDeviceView = (
  device: MeasuringDevice,
  latestChange: DeviceLifecycleRecord | null
): MeasuringDeviceView => ({
  id: device.id,
  device_code: device.device_code,
  name: device.name,
  device_type: device.device_type,
  accuracy_level: device.accuracy_level,
  owner_dept: device.owner_dept,
  calibration_cycle_days: device.calibration_cycle_days,
  status: device.status,
  lifecycle_status: device.lifecycle_status,
  exempt_reason: device.exempt_reason,
  exempt_until: device.exempt_until,
  last_lifecycle_change: latestChange
});
