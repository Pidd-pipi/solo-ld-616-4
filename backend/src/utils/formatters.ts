import { DeviceCalibrationStatus } from "../constants/DeviceCalibrationStatus";
import { DeviceLifecycleStatus } from "../constants/DeviceLifecycleStatus";

export const toAuditTarget = (type: string, id: string | number) => `${type}#${id}`;

const DEVICE_CALIBRATION_STATUS_TEXT: Record<string, string> = {
  VALID: "合格有效",
  DUE_SOON: "即将到期",
  OVERDUE: "已超期",
  CALIBRATING: "校准中",
  SCRAPPED: "已报废"
};

const DEVICE_LIFECYCLE_STATUS_TEXT: Record<string, string> = {
  ACTIVE: "在役",
  EXEMPT: "校准豁免",
  SCRAPPED: "已报废"
};

export const formatDeviceCalibrationStatus = (status: string): string =>
  DEVICE_CALIBRATION_STATUS_TEXT[status] ?? status;

export const formatDeviceLifecycleStatus = (status: string): string =>
  DEVICE_LIFECYCLE_STATUS_TEXT[status] ?? status;

export const isPendingCalibrationStatus = (status: string): boolean =>
  (DeviceCalibrationStatus as readonly string[]).includes(status) &&
  (["DUE_SOON", "OVERDUE"] as readonly string[]).includes(status);

export const formatIsoDate = (value: string | null): string => (value ? value.slice(0, 10) : "-");
