import type { DeviceLifecycleRecord } from "../models/DeviceLifecycleRecord";
import type { DeviceLifecycleAction } from "../constants/DeviceLifecycleAction";
import type { DeviceLifecycleStatus } from "../constants/DeviceLifecycleStatus";

/**
 * 生命周期变更记录构造器：豁免、到期自动恢复、报废统一经此追加。
 */
export const buildDeviceLifecycleRecord = (input: {
  id: number;
  device_id: number;
  action: DeviceLifecycleAction;
  from_status: DeviceLifecycleStatus;
  to_status: DeviceLifecycleStatus;
  reason: string | null;
  exempt_until: string | null;
  operated_by: string | null;
  created_at: string;
}): DeviceLifecycleRecord => ({ ...input });
