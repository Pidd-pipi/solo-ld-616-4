import type { MeasuringDevice } from "../models/MeasuringDevice";

/**
 * 台账记录创建构造器：新建设备默认在役、无豁免。
 * controller / service 不得散写默认结构，统一经此工厂。
 */
export const buildMeasuringDeviceRow = (
  input: Partial<MeasuringDevice> & Pick<MeasuringDevice, "id" | "device_code" | "name">
): MeasuringDevice => ({
  id: input.id,
  device_code: input.device_code,
  name: input.name,
  device_type: input.device_type ?? "",
  accuracy_level: input.accuracy_level ?? "",
  owner_dept: input.owner_dept ?? "",
  calibration_cycle_days: input.calibration_cycle_days ?? 365,
  status: input.status ?? "VALID",
  lifecycle_status: input.lifecycle_status ?? "ACTIVE",
  exempt_reason: input.exempt_reason ?? null,
  exempt_until: input.exempt_until ?? null
});
