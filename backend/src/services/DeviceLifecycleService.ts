import type { MeasuringDevice } from "../models/MeasuringDevice";
import type { DeviceLifecycleRecord } from "../models/DeviceLifecycleRecord";
import type { DeviceLifecycleExemptPayload } from "../types/DeviceLifecycleExemptPayload";
import type { DeviceLifecycleScrapPayload } from "../types/DeviceLifecycleScrapPayload";
import type { MeasuringDeviceView } from "../types/MeasuringDeviceView";
import type { DbClient } from "../repositories/db";
import { withTransaction } from "../repositories/db";
import { measuringDeviceRepository } from "../repositories/MeasuringDeviceRepository";
import { calibrationPlanRepository } from "../repositories/CalibrationPlanRepository";
import { deviceLifecycleRecordRepository } from "../repositories/DeviceLifecycleRecordRepository";
import { buildMeasuringDeviceView } from "../constructors/MeasuringDeviceViewFactory";
import { PENDING_CALIBRATION_STATUS } from "../constants/DeviceCalibrationStatus";
import { LOG_TEMPLATES } from "../constants/logTemplates";
import { ERROR_CODES } from "../constants/errorCodes";
import { ERROR_MESSAGES } from "../constants/errorMessages";
import { DomainError, conflict, formatMessage, notFound } from "../utils/domainError";

/**
 * 设备生命周期领域服务：校准豁免、到期自动恢复、报废。所有写入都在数据库事务内完成，
 * 不保留任何进程内可变状态，重启进程后豁免/报废/变更记录仍然存在。
 *
 * 不变量：
 * 1. 豁免记录原因和截止日；截止日前设备不进入待校准范围；到期后下一次访问自动恢复为在役。
 * 2. 报废是终态；仅当设备没有进行中计划时允许，否则保持原状态并返回 409 冲突。
 * 3. 豁免和报废只更新设备生命周期列并追加变更记录，绝不改写校准计划和证书历史。
 */
export const deviceLifecycleService = {
  /**
   * 全局到期恢复（独立事务，行锁批处理）：把所有已过截止日的豁免设备恢复为 ACTIVE。
   * 任意读/写入口都会先调用，保证“到期后自动恢复”在重启后依然成立。
   */
  restoreExpiredDevices: async (nowIso: string): Promise<number> =>
    withTransaction(async (client) => {
      const expired = await measuringDeviceRepository.findExpiredExemptForUpdate(client, nowIso);
      for (const device of expired) {
        const restored = await measuringDeviceRepository.updateLifecycle(client, device.id, {
          lifecycle_status: "ACTIVE",
          exempt_reason: null,
          exempt_until: null
        });
        await deviceLifecycleService.appendRecord(client, {
          device_id: restored.id,
          action: "EXPIRE_RESTORE",
          from_status: "EXEMPT",
          to_status: "ACTIVE",
          reason: device.exempt_reason,
          exempt_until: device.exempt_until,
          operated_by: "system",
          created_at: nowIso
        });
        console.info(LOG_TEMPLATES.DeviceLifecycle[1], device.id, device.exempt_until);
      }
      return expired.length;
    }),

  /**
   * 读取设备当前有效状态：先触发全局到期恢复，再按 id 取行。
   */
  resolveEffectiveDevice: async (id: number, nowIso: string): Promise<MeasuringDevice> => {
    await deviceLifecycleService.restoreExpiredDevices(nowIso);
    const device = await measuringDeviceRepository.findById(id);
    if (!device) {
      throw notFound(ERROR_CODES.DEVICE_NOT_FOUND, formatMessage(ERROR_MESSAGES.DEVICE_NOT_FOUND, id));
    }
    return device;
  },

  exempt: async (id: number, payload: DeviceLifecycleExemptPayload): Promise<MeasuringDeviceView> => {
    const nowIso = payload.now ?? new Date().toISOString();
    await deviceLifecycleService.restoreExpiredDevices(nowIso);

    return withTransaction(async (client) => {
      const device = await deviceLifecycleService.lockDevice(client, id);

      if (device.lifecycle_status === "SCRAPPED") {
        throw conflict(
          ERROR_CODES.DEVICE_ALREADY_SCRAPPED,
          formatMessage(ERROR_MESSAGES.DEVICE_ALREADY_SCRAPPED, id)
        );
      }
      if (device.lifecycle_status === "EXEMPT") {
        throw conflict(
          ERROR_CODES.DEVICE_ALREADY_EXEMPT,
          formatMessage(ERROR_MESSAGES.DEVICE_ALREADY_EXEMPT, id, device.exempt_until ?? "")
        );
      }

      const updated = await measuringDeviceRepository.updateLifecycle(client, id, {
        lifecycle_status: "EXEMPT",
        exempt_reason: payload.reason,
        exempt_until: payload.exempt_until
      });
      const record = await deviceLifecycleService.appendRecord(client, {
        device_id: id,
        action: "EXEMPT",
        from_status: device.lifecycle_status,
        to_status: "EXEMPT",
        reason: payload.reason,
        exempt_until: payload.exempt_until,
        operated_by: payload.operated_by ?? null,
        created_at: nowIso
      });
      console.info(LOG_TEMPLATES.DeviceLifecycle[0], id, payload.exempt_until);
      return buildMeasuringDeviceView(updated, record);
    });
  },

  scrap: async (id: number, payload: DeviceLifecycleScrapPayload = {}): Promise<MeasuringDeviceView> => {
    const nowIso = payload.now ?? new Date().toISOString();
    await deviceLifecycleService.restoreExpiredDevices(nowIso);

    return withTransaction(async (client) => {
      const device = await deviceLifecycleService.lockDevice(client, id);

      if (device.lifecycle_status === "SCRAPPED") {
        throw conflict(
          ERROR_CODES.DEVICE_ALREADY_SCRAPPED,
          formatMessage(ERROR_MESSAGES.DEVICE_ALREADY_SCRAPPED, id)
        );
      }

      const inProgressCount = await calibrationPlanRepository.countInProgressByDeviceId(client, id);
      if (inProgressCount > 0) {
        // 保持原状态：不更新设备行、不追加报废记录，事务直接以 409 回滚。
        console.info(LOG_TEMPLATES.DeviceLifecycle[3], id, inProgressCount);
        throw new DomainError(
          409,
          ERROR_CODES.DEVICE_SCRAP_PLAN_CONFLICT,
          formatMessage(ERROR_MESSAGES.DEVICE_SCRAP_PLAN_CONFLICT, id, inProgressCount)
        );
      }

      const updated = await measuringDeviceRepository.updateLifecycle(client, id, {
        lifecycle_status: "SCRAPPED",
        exempt_reason: null,
        exempt_until: null,
        status: "SCRAPPED"
      });
      const record = await deviceLifecycleService.appendRecord(client, {
        device_id: id,
        action: "SCRAP",
        from_status: device.lifecycle_status,
        to_status: "SCRAPPED",
        reason: payload.reason ?? null,
        exempt_until: null,
        operated_by: payload.operated_by ?? null,
        created_at: nowIso
      });
      console.info(LOG_TEMPLATES.DeviceLifecycle[2], id);
      return buildMeasuringDeviceView(updated, record);
    });
  },

  listDueCalibration: async (nowIso: string = new Date().toISOString()): Promise<MeasuringDeviceView[]> => {
    console.info(LOG_TEMPLATES.DeviceLifecycle[5]);
    await deviceLifecycleService.restoreExpiredDevices(nowIso);
    const devices = await measuringDeviceRepository.findAll();
    const views: MeasuringDeviceView[] = [];
    for (const device of devices) {
      if (
        device.lifecycle_status === "ACTIVE" &&
        (PENDING_CALIBRATION_STATUS as readonly string[]).includes(device.status)
      ) {
        const latest = await deviceLifecycleRecordRepository.findLatestByDeviceId(device.id);
        views.push(buildMeasuringDeviceView(device, latest));
      }
    }
    return views;
  },

  /**
   * 事务内取设备行锁；找不到抛 404。
   */
  lockDevice: async (client: DbClient, id: number): Promise<MeasuringDevice> => {
    const device = await measuringDeviceRepository.findByIdForUpdate(client, id);
    if (!device) {
      throw notFound(ERROR_CODES.DEVICE_NOT_FOUND, formatMessage(ERROR_MESSAGES.DEVICE_NOT_FOUND, id));
    }
    return device;
  },

  appendRecord: async (
    client: DbClient,
    fields: Omit<DeviceLifecycleRecord, "id">
  ): Promise<DeviceLifecycleRecord> =>
    deviceLifecycleRecordRepository.append(client, fields)
};
