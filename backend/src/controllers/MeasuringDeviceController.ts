import type { Request, Response, NextFunction } from "express";
import { measuringDeviceService } from "../services/MeasuringDeviceService";
import { wrapControllerError } from "../utils/controllerError";
import { runIdempotent } from "../utils/idempotentRun";

/**
 * 设备台账控制器。原有建档/查询入口保持不变；写接口支持 Idempotency-Key 去重。
 */
export const measuringDeviceController = {
  list: async (_req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await measuringDeviceService.list());
    } catch (err) {
      next(wrapControllerError(err, "MeasuringDevice.list"));
    }
  },

  create: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const outcome = await runIdempotent(req, "MeasuringDevice.create", async () => ({
        statusCode: 201,
        body: await measuringDeviceService.create(req.body)
      }));
      res.status(outcome.statusCode).json(outcome.body);
    } catch (err) {
      next(wrapControllerError(err, "MeasuringDevice.create"));
    }
  }
};
