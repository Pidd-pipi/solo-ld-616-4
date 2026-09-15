import type { Request, Response, NextFunction } from "express";
import { calibrationPlanService } from "../services/CalibrationPlanService";
import { validatePlanCreateBody } from "../validators/deviceLifecycleValidator";
import { wrapControllerError } from "../utils/controllerError";

/**
 * 校准计划控制器。新建计划会按设备当前有效状态拒绝报废/豁免设备（409）。
 */
export const calibrationPlanController = {
  list: (_req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(calibrationPlanService.list());
    } catch (err) {
      next(wrapControllerError(err, "CalibrationPlan.list"));
    }
  },

  create: (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = validatePlanCreateBody(req.body ?? {});
      res.status(201).json(calibrationPlanService.create(body));
    } catch (err) {
      next(wrapControllerError(err, "CalibrationPlan.create"));
    }
  }
};
