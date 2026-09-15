import { seed } from "../seed";
import type { MeasuringDevice } from "../models/MeasuringDevice";
import type { CalibrationPlan } from "../models/CalibrationPlan";
import type { CalibrationCertificate } from "../models/CalibrationCertificate";
import type { CalibrationVendor } from "../models/CalibrationVendor";
import type { OverdueAlert } from "../models/OverdueAlert";
import type { DeviceLifecycleRecord } from "../models/DeviceLifecycleRecord";

/**
 * 进程内可变数据存储。
 * 仓储统一从这里读写；seed 只作为初始快照，不能被业务写操作改写。
 * 生命周期豁免、恢复、报废以及计划冲突判断都依赖可变状态，因此集中在此处。
 */
const clone = <T>(rows: readonly T[]): T[] => rows.map((row) => ({ ...row }));

/**
 * 旧 seed 行可能没有生命周期列，进入可变存储时补齐默认值（在役、无豁免）。
 */
const hydrateDevice = (row: any): MeasuringDevice => ({
  ...row,
  calibration_cycle_days: Number(row.calibration_cycle_days) || 0,
  lifecycle_status: row.lifecycle_status ?? "ACTIVE",
  exempt_reason: row.exempt_reason ?? null,
  exempt_until: row.exempt_until ?? null
});

interface InMemoryTables {
  measuringDevice: MeasuringDevice[];
  calibrationPlan: CalibrationPlan[];
  calibrationCertificate: CalibrationCertificate[];
  calibrationVendor: CalibrationVendor[];
  overdueAlert: OverdueAlert[];
  deviceLifecycleRecord: DeviceLifecycleRecord[];
}

const tables: InMemoryTables = {
  measuringDevice: (seed.measuringDevice as readonly unknown[] as MeasuringDevice[]).map(hydrateDevice),
  calibrationPlan: clone(seed.calibrationPlan as readonly unknown[] as CalibrationPlan[]),
  calibrationCertificate: clone(seed.calibrationCertificate as readonly unknown[] as CalibrationCertificate[]),
  calibrationVendor: clone(seed.calibrationVendor as readonly CalibrationVendor[]),
  overdueAlert: clone(seed.overdueAlert as readonly unknown[] as OverdueAlert[]),
  deviceLifecycleRecord: []
};

/**
 * 新建设备/计划/记录时使用的每张表各自的自增主键。
 */
const nextIdMap: Record<keyof InMemoryTables, number> = {
  measuringDevice: tables.measuringDevice.reduce((max, row) => Math.max(max, row.id), 0) + 1,
  calibrationPlan: tables.calibrationPlan.reduce((max, row) => Math.max(max, row.id), 0) + 1,
  calibrationCertificate: tables.calibrationCertificate.reduce((max, row) => Math.max(max, row.id), 0) + 1,
  calibrationVendor: tables.calibrationVendor.reduce((max, row) => Math.max(max, row.id), 0) + 1,
  overdueAlert: tables.overdueAlert.reduce((max, row) => Math.max(max, row.id), 0) + 1,
  deviceLifecycleRecord: 1
};

export const inMemoryStore = {
  table<K extends keyof InMemoryTables>(name: K): InMemoryTables[K] {
    return tables[name];
  },
  nextId(name: keyof InMemoryTables): number {
    const id = nextIdMap[name];
    nextIdMap[name] += 1;
    return id;
  }
};
