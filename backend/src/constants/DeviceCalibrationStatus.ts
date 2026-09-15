export const DeviceCalibrationStatus = ["VALID","DUE_SOON","OVERDUE","CALIBRATING","SCRAPPED"] as const;
export type DeviceCalibrationStatus = (typeof DeviceCalibrationStatus)[number];
