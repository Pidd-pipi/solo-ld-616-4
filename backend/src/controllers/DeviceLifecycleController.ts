import type { Request, Response, NextFunction } from "express";
import { deviceLifecycleService } from "../services/DeviceLifecycleService";
import {
  validateDeviceId,
  validateExemptBody,
  validateScrapBody
} from "../validators/deviceLifecycleValidator";
import { wrapControllerError } from "../utils/controllerError";
import { LOG_TEMPLATES } from "../constants/logTemplates";

/**
 * 生命周期写操作控制器：校准豁免、报废、待校准范围查询。
 * 到期恢复是自动行为，在任意设备读取路径（含这里）内触发，不提供手工恢复接口。
 */
export const deviceLifecycleController = {
  exempt: (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = validateDeviceId(req.params.id);
      const payload = validateExemptBody(req.body ?? {});
      const view = deviceLifecycleService.exempt(id, payload);
      res.status(200).json(view);
    } catch (err) {
      next(wrapControllerError(err, "DeviceLifecycle.exempt"));
    }
  },

  scrap: (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = validateDeviceId(req.params.id);
      const payload = validateScrapBody(req.body);
      const view = deviceLifecycleService.scrap(id, payload);
      res.status(200).json(view);
    } catch (err) {
      // 进行中计划冲突：service 已保证设备保持原状态，此处仅转交 409。
      console.info(LOG_TEMPLATES.DeviceLifecycle[3], "controller", req.params.id);
      next(wrapControllerError(err, "DeviceLifecycle.scrap"));
    }
  },

  listDueCalibration: (_req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(deviceLifecycleService.listDueCalibration());
    } catch (err) {
      next(wrapControllerError(err, "DeviceLifecycle.dueCalibration"));
    }
  }
};
