import type { CalibrationPlan } from "../models/CalibrationPlan";
import { calibrationPlanRepository } from "../repositories/CalibrationPlanRepository";
import { buildCalibrationPlanRow } from "../constructors/CalibrationPlanRowBuilder";
import { deviceLifecycleService } from "./DeviceLifecycleService";
import { LOG_TEMPLATES } from "../constants/logTemplates";

/**
 * 校准计划服务。
 * 新建计划前必须通过设备当前有效状态准入：报废（终态）或豁免有效期内的设备直接拒绝。
 * 生命周期操作不会改写既有计划，计划历史与证书历史保持不变。
 */
export const calibrationPlanService = {
  list: (): CalibrationPlan[] => calibrationPlanRepository.findAll(),

  listByDeviceId: (deviceId: number): CalibrationPlan[] =>
    calibrationPlanRepository.findByDeviceId(deviceId),

  create: (
    row: Partial<CalibrationPlan> & { device_id?: number },
    context: { now?: string } = {}
  ): CalibrationPlan => {
    const deviceId = Number(row.device_id);
    // 按当前有效状态拒绝（内部会先触发豁免到期自动恢复）。
    deviceLifecycleService.assertPlanAllowed(deviceId, context.now ?? new Date().toISOString());

    const id = typeof row.id === "number" ? row.id : calibrationPlanRepository.nextId();
    const saved = calibrationPlanRepository.save(buildCalibrationPlanRow({ ...row, id, device_id: deviceId }));
    console.info(LOG_TEMPLATES.CalibrationPlan[0], saved.id, saved.device_id);
    return saved;
  }
};
