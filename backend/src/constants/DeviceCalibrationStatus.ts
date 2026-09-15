export const DeviceCalibrationStatus = ["VALID","DUE_SOON","OVERDUE","CALIBRATING","SCRAPPED"] as const;
export type DeviceCalibrationStatus = (typeof DeviceCalibrationStatus)[number];

/**
 * 需要进入待校准范围的校准状态。
 * 豁免中的设备在有效期内即使处于以下状态也不进入待校准范围。
 */
export const PENDING_CALIBRATION_STATUS: ReadonlyArray<DeviceCalibrationStatus> = ["DUE_SOON", "OVERDUE"];
