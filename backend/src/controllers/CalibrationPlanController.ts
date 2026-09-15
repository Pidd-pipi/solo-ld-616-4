import type { Request, Response, NextFunction } from "express";
import { calibrationPlanService } from "../services/CalibrationPlanService";
import { validatePlanCreateBody } from "../validators/deviceLifecycleValidator";
import { wrapControllerError } from "../utils/controllerError";
import { runIdempotent } from "../utils/idempotentRun";

/**
 * 校准计划控制器。新建计划按设备当前有效状态拒绝报废/豁免设备（409），并支持幂等去重。
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
      const outcome = await runIdempotent(req, "CalibrationPlan.create", async () => ({
        statusCode: 201,
        body: await calibrationPlanService.create(body)
      }));
      res.status(outcome.statusCode).json(outcome.body);
    } catch (err) {
      next(wrapControllerError(err, "CalibrationPlan.create"));
    }
  }
};
