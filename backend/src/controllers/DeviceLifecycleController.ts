import type { Request, Response, NextFunction } from "express";
import { deviceLifecycleService } from "../services/DeviceLifecycleService";
import {
  validateDeviceId,
  validateExemptBody,
  validateScrapBody
} from "../validators/deviceLifecycleValidator";
import { wrapControllerError } from "../utils/controllerError";
import { runIdempotent } from "../utils/idempotentRun";

/**
 * 生命周期写操作控制器：校准豁免、报废、待校准范围查询。
 * 到期恢复是自动行为，在任意设备读取路径内触发，不提供手工恢复接口。
 * 豁免/报废支持 Idempotency-Key：重复提交不会产生第二条生命周期记录。
 */
export const deviceLifecycleController = {
  exempt: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = validateDeviceId(req.params.id);
      const payload = validateExemptBody(req.body ?? {});
      const outcome = await runIdempotent(req, "DeviceLifecycle.exempt", async () => ({
        statusCode: 200,
        body: await deviceLifecycleService.exempt(id, payload)
      }));
      res.status(outcome.statusCode).json(outcome.body);
    } catch (err) {
      next(wrapControllerError(err, "DeviceLifecycle.exempt"));
    }
  },

  scrap: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = validateDeviceId(req.params.id);
      const payload = validateScrapBody(req.body);
      const outcome = await runIdempotent(req, "DeviceLifecycle.scrap", async () => ({
        statusCode: 200,
        body: await deviceLifecycleService.scrap(id, payload)
      }));
      res.status(outcome.statusCode).json(outcome.body);
    } catch (err) {
      // 进行中计划冲突：service 已保证设备保持原状态（事务回滚），此处仅转交 409。
      next(wrapControllerError(err, "DeviceLifecycle.scrap"));
    }
  },

  listDueCalibration: async (_req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await deviceLifecycleService.listDueCalibration());
    } catch (err) {
      next(wrapControllerError(err, "DeviceLifecycle.dueCalibration"));
    }
  }
};
