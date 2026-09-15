import type { Request, Response, NextFunction } from "express";
import { calibrationPlanService } from "../services/CalibrationPlanService";
import { deviceLifecycleService } from "../services/DeviceLifecycleService";
import { validatePlanCreateBody } from "../validators/deviceLifecycleValidator";
import { wrapControllerError } from "../utils/controllerError";
import { runIdempotent } from "../utils/idempotentRun";

/**
 * 校准计划控制器。新建计划按设备当前有效状态拒绝报废/豁免设备（409），
 * 支持按范围隔离的 Idempotency-Key，持有者失联可安全接管。
 */
export const calibrationPlanController = {
  list: async (_req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await calibrationPlanService.list());
    } catch (err) {
      next(wrapControllerError(err, "CalibrationPlan.list"));
    }
  },

  create: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = validatePlanCreateBody(req.body ?? {});
      const nowIso = new Date().toISOString();
      const outcome = await runIdempotent(
        req,
        "CalibrationPlan.create",
        (client) =>
          calibrationPlanService
            .createInTxn(client, body, nowIso)
            .then((saved) => ({ statusCode: 201, body: saved })),
        // 到期恢复在业务事务前独立提交。
        () => deviceLifecycleService.restoreExpiredDevices(nowIso)
      );
      res.status(outcome.statusCode).json(outcome.body);
    } catch (err) {
      next(wrapControllerError(err, "CalibrationPlan.create"));
    }
  }
};
