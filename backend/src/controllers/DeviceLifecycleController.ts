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
 * 豁免/报废支持 Idempotency-Key：按接口范围隔离，持有者失联可安全接管，重复提交不会产生第二条记录。
 */
export const deviceLifecycleController = {
  exempt: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = validateDeviceId(req.params.id);
      const payload = validateExemptBody(req.body ?? {});
      const nowIso = payload.now ?? new Date().toISOString();
      const outcome = await runIdempotent(
        req,
        "DeviceLifecycle.exempt",
        (client) =>
          deviceLifecycleService
            .exemptInTxn(client, id, payload, nowIso)
            .then((body) => ({ statusCode: 200, body })),
        // 到期恢复在业务事务前以独立事务提交，避免与占位/业务行锁长时间耦合。
        () => deviceLifecycleService.restoreExpiredDevices(nowIso)
      );
      res.status(outcome.statusCode).json(outcome.body);
    } catch (err) {
      next(wrapControllerError(err, "DeviceLifecycle.exempt"));
    }
  },

  scrap: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = validateDeviceId(req.params.id);
      const payload = validateScrapBody(req.body);
      const nowIso = payload.now ?? new Date().toISOString();
      const outcome = await runIdempotent(
        req,
        "DeviceLifecycle.scrap",
        (client) =>
          deviceLifecycleService
            .scrapInTxn(client, id, payload, nowIso)
            .then((body) => ({ statusCode: 200, body })),
        () => deviceLifecycleService.restoreExpiredDevices(nowIso)
      );
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
