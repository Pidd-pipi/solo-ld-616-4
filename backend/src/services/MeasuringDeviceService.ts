import type { MeasuringDevice } from "../models/MeasuringDevice";
import type { MeasuringDeviceView } from "../types/MeasuringDeviceView";
import { measuringDeviceRepository } from "../repositories/MeasuringDeviceRepository";
import { deviceLifecycleRecordRepository } from "../repositories/DeviceLifecycleRecordRepository";
import { isUniqueViolation } from "../repositories/db";
import { deviceLifecycleService } from "./DeviceLifecycleService";
import { buildMeasuringDeviceView } from "../constructors/MeasuringDeviceViewFactory";
import { ERROR_CODES } from "../constants/errorCodes";
import { ERROR_MESSAGES } from "../constants/errorMessages";
import { conflict, formatMessage } from "../utils/domainError";

/**
 * 设备台账服务。原有建档/查询入口保持不变；查询结果为台账视图：
 * 同时返回生命周期、校准状态和最近一次生命周期变更记录。所有数据均来自 PostgreSQL。
 */
export const measuringDeviceService = {
  list: async (nowIso: string = new Date().toISOString()): Promise<MeasuringDeviceView[]> => {
    await deviceLifecycleService.restoreExpiredDevices(nowIso);
    const devices = await measuringDeviceRepository.findAll();
    const views: MeasuringDeviceView[] = [];
    for (const device of devices) {
      const latest = await deviceLifecycleRecordRepository.findLatestByDeviceId(device.id);
      views.push(buildMeasuringDeviceView(device, latest));
    }
    return views;
  },

  getById: async (id: number, nowIso: string = new Date().toISOString()): Promise<MeasuringDeviceView> => {
    const device = await deviceLifecycleService.resolveEffectiveDevice(id, nowIso);
    const latest = await deviceLifecycleRecordRepository.findLatestByDeviceId(id);
    return buildMeasuringDeviceView(device, latest);
  },

  create: async (
    row: Partial<MeasuringDevice> & { device_code?: string; name?: string }
  ): Promise<MeasuringDevice> => {
    try {
      // 先写库，成功后才返回；写库失败由全局异常链路返回明确错误，绝不只改内存后报告成功。
      return await measuringDeviceRepository.insert({
        device_code: row.device_code ?? "",
        name: row.name ?? "",
        device_type: row.device_type ?? "",
        accuracy_level: row.accuracy_level ?? "",
        owner_dept: row.owner_dept ?? "",
        calibration_cycle_days:
          typeof row.calibration_cycle_days === "number" && Number.isFinite(row.calibration_cycle_days)
            ? row.calibration_cycle_days
            : 365,
        status: row.status ?? "VALID"
      });
    } catch (err) {
      // 重复建档（device_code 唯一约束）→ 409，且不产生第二条记录。
      const cause = (err as { cause?: unknown })?.cause;
      if (isUniqueViolation(cause)) {
        throw conflict(
          ERROR_CODES.DEVICE_CODE_DUPLICATED,
          formatMessage(ERROR_MESSAGES.DEVICE_CODE_DUPLICATED, row.device_code ?? "")
        );
      }
      throw err;
    }
  }
};
