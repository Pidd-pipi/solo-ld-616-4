import type { CalibrationPlan } from "../models/CalibrationPlan";
import { withTransaction, type DbClient } from "../repositories/db";
import { calibrationPlanRepository } from "../repositories/CalibrationPlanRepository";
import { measuringDeviceRepository } from "../repositories/MeasuringDeviceRepository";
import { buildCalibrationPlanRow } from "../constructors/CalibrationPlanRowBuilder";
import { deviceLifecycleService } from "./DeviceLifecycleService";
import { LOG_TEMPLATES } from "../constants/logTemplates";
import { ERROR_CODES } from "../constants/errorCodes";
import { ERROR_MESSAGES } from "../constants/errorMessages";
import { conflict, formatMessage, notFound } from "../utils/domainError";

/**
 * 校准计划服务。
 * 新建计划前必须通过设备当前有效状态准入：报废（终态）或豁免有效期内直接拒绝（409）。
 * 设备行锁与计划插入在同一事务内；生命周期操作不会改写既有计划与证书历史。
 */
export const calibrationPlanService = {
  list: async (): Promise<CalibrationPlan[]> => calibrationPlanRepository.findAll(),

  listByDeviceId: async (deviceId: number): Promise<CalibrationPlan[]> =>
    calibrationPlanRepository.findByDeviceId(deviceId),

  create: async (
    row: Partial<CalibrationPlan> & { device_id?: number },
    context: { now?: string } = {}
  ): Promise<CalibrationPlan> => {
    const nowIso = context.now ?? new Date().toISOString();
    const deviceId = Number(row.device_id);
    await deviceLifecycleService.restoreExpiredDevices(nowIso);

    return withTransaction(async (client: DbClient) => {
      const device = await measuringDeviceRepository.findByIdForUpdate(client, deviceId);
      if (!device) {
        throw notFound(
          ERROR_CODES.DEVICE_NOT_FOUND,
          formatMessage(ERROR_MESSAGES.DEVICE_NOT_FOUND, deviceId)
        );
      }
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

      const built = buildCalibrationPlanRow({ ...row, id: 0, device_id: deviceId });
      const saved = await calibrationPlanRepository.insert(client, {
        device_id: built.device_id,
        planned_date: built.planned_date,
        plan_type: built.plan_type,
        priority: built.priority,
        status: built.status,
        assigned_vendor_id: built.assigned_vendor_id,
        created_by: built.created_by
      });
      console.info(LOG_TEMPLATES.CalibrationPlan[0], saved.id, saved.device_id);
      return saved;
    });
  }
};
