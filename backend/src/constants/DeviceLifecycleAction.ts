export const DeviceLifecycleAction = ["EXEMPT", "EXPIRE_RESTORE", "SCRAP"] as const;
export type DeviceLifecycleAction = (typeof DeviceLifecycleAction)[number];
