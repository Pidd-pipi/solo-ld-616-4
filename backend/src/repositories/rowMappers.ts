import type { QueryResultRow } from "pg";
import type { MeasuringDevice } from "../models/MeasuringDevice";
import type { CalibrationPlan } from "../models/CalibrationPlan";
import type { CalibrationCertificate } from "../models/CalibrationCertificate";
import type { CalibrationVendor } from "../models/CalibrationVendor";
import type { OverdueAlert } from "../models/OverdueAlert";
import type { DeviceLifecycleRecord } from "../models/DeviceLifecycleRecord";

/**
 * pg 的 TIMESTAMPTZ 列返回 Date，统一转成 ISO 字符串，保持模型层字段类型为 string。
 */
const toIso = (value: unknown): string | null => {
  if (value === null || value === undefined) {
    return null;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  return String(value);
};

export const mapMeasuringDevice = (row: QueryResultRow): MeasuringDevice => ({
  id: Number(row.id),
  device_code: row.device_code,
  name: row.name,
  device_type: row.device_type,
  accuracy_level: row.accuracy_level,
  owner_dept: row.owner_dept,
  calibration_cycle_days: Number(row.calibration_cycle_days),
  status: row.status,
  lifecycle_status: row.lifecycle_status,
  exempt_reason: row.exempt_reason ?? null,
  exempt_until: toIso(row.exempt_until)
});

export const mapCalibrationPlan = (row: QueryResultRow): CalibrationPlan => ({
  id: Number(row.id),
  device_id: Number(row.device_id),
  planned_date: toIso(row.planned_date) ?? "",
  plan_type: row.plan_type,
  priority: row.priority,
  status: row.status,
  assigned_vendor_id: Number(row.assigned_vendor_id ?? 0),
  created_by: row.created_by
});

export const mapCalibrationCertificate = (row: QueryResultRow): CalibrationCertificate => ({
  id: Number(row.id),
  device_id: Number(row.device_id),
  plan_id: Number(row.plan_id ?? 0),
  certificate_no: row.certificate_no,
  result_status: row.result_status,
  valid_until: row.valid_until,
  file_path: row.file_path,
  issued_by: row.issued_by
});

export const mapCalibrationVendor = (row: QueryResultRow): CalibrationVendor => ({
  id: Number(row.id),
  vendor_name: row.vendor_name,
  qualification_no: row.qualification_no,
  contact_phone: row.contact_phone,
  service_scope: row.service_scope,
  vendor_status: row.vendor_status
});

export const mapOverdueAlert = (row: QueryResultRow): OverdueAlert => ({
  id: Number(row.id),
  device_id: Number(row.device_id),
  plan_id: Number(row.plan_id ?? 0),
  alert_level: row.alert_level,
  alert_reason: row.alert_reason,
  handled_by: row.handled_by,
  handled_at: toIso(row.handled_at) ?? "",
  status: row.status
});

export const mapDeviceLifecycleRecord = (row: QueryResultRow): DeviceLifecycleRecord => ({
  id: Number(row.id),
  device_id: Number(row.device_id),
  action: row.action,
  from_status: row.from_status,
  to_status: row.to_status,
  reason: row.reason ?? null,
  exempt_until: toIso(row.exempt_until),
  operated_by: row.operated_by ?? null,
  created_at: toIso(row.created_at) ?? ""
});
