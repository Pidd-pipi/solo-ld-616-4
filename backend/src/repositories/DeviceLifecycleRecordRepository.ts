import type { DeviceLifecycleRecord } from "../models/DeviceLifecycleRecord";
import { inMemoryStore } from "./inMemoryStore";

/**
 * 生命周期变更记录数据访问层：只追加、不改写历史。
 */
export const deviceLifecycleRecordRepository = {
  findByDeviceId: (deviceId: number): DeviceLifecycleRecord[] =>
    inMemoryStore
      .table("deviceLifecycleRecord")
      .filter((row) => row.device_id === deviceId)
      .sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : b.id - a.id)),

  findLatestByDeviceId: (deviceId: number): DeviceLifecycleRecord | null =>
    deviceLifecycleRecordRepository.findByDeviceId(deviceId)[0] ?? null,

  append: (record: DeviceLifecycleRecord): DeviceLifecycleRecord => {
    inMemoryStore.table("deviceLifecycleRecord").push(record);
    return record;
  },

  nextId: (): number => inMemoryStore.nextId("deviceLifecycleRecord")
};
