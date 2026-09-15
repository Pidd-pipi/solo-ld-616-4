import type { MeasuringDevice } from "../models/MeasuringDevice";
import { inMemoryStore } from "./inMemoryStore";

/**
 * 设备台账数据访问层。
 * 生命周期字段（lifecycle_status / exempt_reason / exempt_until）随设备行持久化，
 * 但豁免与报废不会触碰任何校准计划和证书数据。
 */
export const measuringDeviceRepository = {
  findAll: (): MeasuringDevice[] => inMemoryStore.table("measuringDevice"),

  findById: (id: number): MeasuringDevice | undefined =>
    inMemoryStore.table("measuringDevice").find((row) => row.id === id),

  save: (row: MeasuringDevice): MeasuringDevice => {
    const table = inMemoryStore.table("measuringDevice");
    const index = table.findIndex((existing) => existing.id === row.id);
    if (index === -1) {
      table.push(row);
      return row;
    }
    table[index] = row;
    return row;
  },

  nextId: (): number => inMemoryStore.nextId("measuringDevice")
};
