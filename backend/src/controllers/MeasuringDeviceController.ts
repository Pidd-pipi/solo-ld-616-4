import type { Request, Response, NextFunction } from "express";
import { measuringDeviceService } from "../services/MeasuringDeviceService";
import { wrapControllerError } from "../utils/controllerError";

/**
 * 设备台账控制器。原有列表/建档接口保持不变；
 * 列表项现在统一返回生命周期、校准状态和最近一次变更记录。
 */
export const measuringDeviceController = {
  list: (_req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(measuringDeviceService.list());
    } catch (err) {
      next(wrapControllerError(err, "MeasuringDevice.list"));
    }
  },

  create: (req: Request, res: Response, next: NextFunction) => {
    try {
      res.status(201).json(measuringDeviceService.create(req.body));
    } catch (err) {
      next(wrapControllerError(err, "MeasuringDevice.create"));
    }
  }
};
