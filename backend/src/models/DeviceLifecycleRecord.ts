import type { DeviceLifecycleAction } from "../constants/DeviceLifecycleAction";
import type { DeviceLifecycleStatus } from "../constants/DeviceLifecycleStatus";

/**
 * 设备生命周期变更记录：豁免、到期自动恢复、报废均追加一条，
 * 仅追加不改写，用于台账查询返回最近一次变更。
 * 豁免/报废不会改写任何校准计划和证书历史。
 */
export interface DeviceLifecycleRecord {
  id: number;
  device_id: number;
  action: DeviceLifecycleAction;
  from_status: DeviceLifecycleStatus;
  to_status: DeviceLifecycleStatus;
  reason: string | null;
  exempt_until: string | null;
  operated_by: string | null;
  created_at: string;
}
