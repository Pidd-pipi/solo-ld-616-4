import type { MeasuringDevice } from "../models/MeasuringDevice";
import type { MeasuringDeviceView } from "../types/MeasuringDeviceView";
import { measuringDeviceRepository } from "../repositories/MeasuringDeviceRepository";
import { deviceLifecycleRecordRepository } from "../repositories/DeviceLifecycleRecordRepository";
import { deviceLifecycleService } from "./DeviceLifecycleService";
import { buildMeasuringDeviceRow } from "../constructors/MeasuringDeviceRowBuilder";
import { buildMeasuringDeviceView } from "../constructors/MeasuringDeviceViewFactory";

/**
 * 设备台账服务。原有建档/查询流程保持不变，
 * 查询结果升级为台账视图：同时返回生命周期、校准状态和最近一次生命周期变更记录。
 */
export const measuringDeviceService = {
  list: (nowIso: string = new Date().toISOString()): MeasuringDeviceView[] =>
    measuringDeviceRepository
      .findAll()
      .map((device) => deviceLifecycleService.resolveEffectiveDevice(device.id, nowIso))
      .map((device) =>
        buildMeasuringDeviceView(device, deviceLifecycleRecordRepository.findLatestByDeviceId(device.id))
      ),

  getById: (id: number, nowIso: string = new Date().toISOString()): MeasuringDeviceView => {
    const device = deviceLifecycleService.resolveEffectiveDevice(id, nowIso);
    return buildMeasuringDeviceView(device, deviceLifecycleRecordRepository.findLatestByDeviceId(id));
  },

  create: (row: Partial<MeasuringDevice> & { device_code?: string; name?: string }): MeasuringDeviceView => {
    const id = typeof row.id === "number" ? row.id : measuringDeviceRepository.nextId();
    const saved = measuringDeviceRepository.save(
      buildMeasuringDeviceRow({
        ...row,
        id,
        device_code: row.device_code ?? "",
        name: row.name ?? ""
      })
    );
    return buildMeasuringDeviceView(saved, null);
  }
};
