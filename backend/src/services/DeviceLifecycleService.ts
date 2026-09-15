import type { MeasuringDevice } from "../models/MeasuringDevice";
import type { DeviceLifecycleRecord } from "../models/DeviceLifecycleRecord";
import type { DeviceLifecycleExemptPayload } from "../types/DeviceLifecycleExemptPayload";
import type { DeviceLifecycleScrapPayload } from "../types/DeviceLifecycleScrapPayload";
import type { MeasuringDeviceView } from "../types/MeasuringDeviceView";
import { measuringDeviceRepository } from "../repositories/MeasuringDeviceRepository";
import { calibrationPlanRepository } from "../repositories/CalibrationPlanRepository";
import { deviceLifecycleRecordRepository } from "../repositories/DeviceLifecycleRecordRepository";
import { buildDeviceLifecycleRecord } from "../constructors/DeviceLifecycleRecordBuilder";
import { buildMeasuringDeviceView } from "../constructors/MeasuringDeviceViewFactory";
import { PENDING_CALIBRATION_STATUS } from "../constants/DeviceCalibrationStatus";
import { LOG_TEMPLATES } from "../constants/logTemplates";
import { ERROR_CODES } from "../constants/errorCodes";
import { ERROR_MESSAGES } from "../constants/errorMessages";
import { DomainError, conflict, formatMessage, notFound } from "../utils/domainError";

/**
 * 设备生命周期领域服务：校准豁免、到期自动恢复、报废。
 *
 * 不变量：
 * 1. 豁免记录原因和截止日；截止日前设备不进入待校准范围；到期后下一次访问自动恢复为在役。
 * 2. 报废是终态；仅当设备没有进行中计划时允许，否则保持原状态并返回 409 冲突。
 * 3. 豁免和报废都不会改写任何校准计划和证书历史；仅维护设备行的生命周期列并追加变更记录。
 */
export const deviceLifecycleService = {
  /**
   * 读取设备前应用豁免到期规则：豁免已过截止日则自动恢复为在役并追加恢复记录。
   * 返回当前有效状态下的设备行。
   */
  resolveEffectiveDevice(id: number, nowIso: string = new Date().toISOString()): MeasuringDevice {
    const device = measuringDeviceRepository.findById(id);
    if (!device) {
      throw notFound(ERROR_CODES.DEVICE_NOT_FOUND, formatMessage(ERROR_MESSAGES.DEVICE_NOT_FOUND, id));
    }
    return deviceLifecycleService.applyExpiry(device, nowIso);
  },

  /**
   * 对任意设备行应用到期恢复（纯内部规则，读列表时也会逐行调用）。
   */
  applyExpiry(device: MeasuringDevice, nowIso: string): MeasuringDevice {
    if (device.lifecycle_status !== "EXEMPT" || !device.exempt_until) {
      return device;
    }
    if (device.exempt_until > nowIso) {
      return device;
    }
    const restored: MeasuringDevice = {
      ...device,
      lifecycle_status: "ACTIVE",
      exempt_reason: null,
      exempt_until: null
    };
    measuringDeviceRepository.save(restored);
    deviceLifecycleService.appendRecord(restored, {
      action: "EXPIRE_RESTORE",
      from_status: "EXEMPT",
      to_status: "ACTIVE",
      reason: device.exempt_reason,
      exempt_until: device.exempt_until,
      operated_by: "system",
      created_at: nowIso
    });
    console.info(LOG_TEMPLATES.DeviceLifecycle[1], device.id, device.exempt_until);
    return restored;
  },

  exempt(id: number, payload: DeviceLifecycleExemptPayload): MeasuringDeviceView {
    const nowIso = payload.now ?? new Date().toISOString();
    const device = deviceLifecycleService.resolveEffectiveDevice(id, nowIso);

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

    const updated: MeasuringDevice = {
      ...device,
      lifecycle_status: "EXEMPT",
      exempt_reason: payload.reason,
      exempt_until: payload.exempt_until
    };
    measuringDeviceRepository.save(updated);
    const record = deviceLifecycleService.appendRecord(updated, {
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
  },

  scrap(id: number, payload: DeviceLifecycleScrapPayload = {}): MeasuringDeviceView {
    const nowIso = payload.now ?? new Date().toISOString();
    const device = deviceLifecycleService.resolveEffectiveDevice(id, nowIso);

    if (device.lifecycle_status === "SCRAPPED") {
      throw conflict(
        ERROR_CODES.DEVICE_ALREADY_SCRAPPED,
        formatMessage(ERROR_MESSAGES.DEVICE_ALREADY_SCRAPPED, id)
      );
    }

    const inProgressCount = calibrationPlanRepository.countInProgressByDeviceId(id);
    if (inProgressCount > 0) {
      // 保持原状态：不写设备行、不追加报废记录，仅登记一条冲突日志并返回冲突。
      console.info(LOG_TEMPLATES.DeviceLifecycle[3], id, inProgressCount);
      throw new DomainError(
        409,
        ERROR_CODES.DEVICE_SCRAP_PLAN_CONFLICT,
        formatMessage(ERROR_MESSAGES.DEVICE_SCRAP_PLAN_CONFLICT, id, inProgressCount)
      );
    }

    const updated: MeasuringDevice = {
      ...device,
      lifecycle_status: "SCRAPPED",
      status: "SCRAPPED",
      exempt_reason: null,
      exempt_until: null
    };
    measuringDeviceRepository.save(updated);
    const record = deviceLifecycleService.appendRecord(updated, {
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
  },

  /**
   * 待校准范围：校准状态为 DUE_SOON / OVERDUE，且当前生命周期在役（豁免未到期、报废均排除）。
   * 读取时统一触发到期自动恢复。
   */
  listDueCalibration(nowIso: string = new Date().toISOString()): MeasuringDeviceView[] {
    console.info(LOG_TEMPLATES.DeviceLifecycle[5]);
    return measuringDeviceRepository
      .findAll()
      .map((device) => deviceLifecycleService.resolveEffectiveDevice(device.id, nowIso))
      .filter(
        (device) =>
          device.lifecycle_status === "ACTIVE" &&
          (PENDING_CALIBRATION_STATUS as readonly string[]).includes(device.status)
      )
      .map((device) =>
        buildMeasuringDeviceView(device, deviceLifecycleRecordRepository.findLatestByDeviceId(device.id))
      );
  },

  /**
   * 新建计划前的准入校验：按设备当前有效状态拒绝报废或豁免中的设备。
   */
  assertPlanAllowed(
    deviceId: number,
    nowIso: string = new Date().toISOString()
  ): MeasuringDevice {
    const device = deviceLifecycleService.resolveEffectiveDevice(deviceId, nowIso);
    if (device.lifecycle_status === "SCRAPPED") {
      console.info(LOG_TEMPLATES.DeviceLifecycle[4], deviceId, "SCRAPPED");
      throw conflict(
        ERROR_CODES.PLAN_DEVICE_SCRAPPED,
        formatMessage(ERROR_MESSAGES.PLAN_DEVICE_SCRAPPED, deviceId)
      );
    }
    if (device.lifecycle_status === "EXEMPT") {
      console.info(LOG_TEMPLATES.DeviceLifecycle[4], deviceId, "EXEMPT");
      throw conflict(
        ERROR_CODES.PLAN_DEVICE_EXEMPT,
        formatMessage(ERROR_MESSAGES.PLAN_DEVICE_EXEMPT, deviceId, device.exempt_until ?? "")
      );
    }
    return device;
  },

  appendRecord(
    device: MeasuringDevice,
    fields: Omit<DeviceLifecycleRecord, "id" | "device_id">
  ): DeviceLifecycleRecord {
    return deviceLifecycleRecordRepository.append(
      buildDeviceLifecycleRecord({
        id: deviceLifecycleRecordRepository.nextId(),
        device_id: device.id,
        ...fields
      })
    );
  }
};
