import type { CalibrationPlan } from "../models/CalibrationPlan";
import { IN_PROGRESS_PLAN_STATUS } from "../constants/PlanStatus";
import { inMemoryStore } from "./inMemoryStore";

export const calibrationPlanRepository = {
  findAll: (): CalibrationPlan[] => inMemoryStore.table("calibrationPlan"),

  findById: (id: number): CalibrationPlan | undefined =>
    inMemoryStore.table("calibrationPlan").find((row) => row.id === id),

  findByDeviceId: (deviceId: number): CalibrationPlan[] =>
    inMemoryStore.table("calibrationPlan").filter((row) => row.device_id === deviceId),

  /**
   * 统计设备仍在进行中的计划数量；报废前必须为 0，否则返回冲突。
   */
  countInProgressByDeviceId: (deviceId: number): number =>
    inMemoryStore
      .table("calibrationPlan")
      .filter((row) => row.device_id === deviceId && IN_PROGRESS_PLAN_STATUS.includes(row.status)).length,

  save: (row: CalibrationPlan): CalibrationPlan => {
    const table = inMemoryStore.table("calibrationPlan");
    const index = table.findIndex((existing) => existing.id === row.id);
    if (index === -1) {
      table.push(row);
      return row;
    }
    table[index] = row;
    return row;
  },

  nextId: (): number => inMemoryStore.nextId("calibrationPlan")
};
