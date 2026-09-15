export const DeviceLifecycleStatus = ["ACTIVE", "EXEMPT", "SCRAPPED"] as const;
export type DeviceLifecycleStatus = (typeof DeviceLifecycleStatus)[number];

/**
 * 生命周期终态：进入后不允许豁免或再报废。
 */
export const TERMINAL_DEVICE_LIFECYCLE_STATUS: ReadonlyArray<DeviceLifecycleStatus> = ["SCRAPPED"];
