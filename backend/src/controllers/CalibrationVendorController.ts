import type { Request, Response, NextFunction } from "express";
import { calibrationVendorService } from "../services/CalibrationVendorService";
import { wrapControllerError } from "../utils/controllerError";
import { runIdempotent } from "../utils/idempotentRun";

export const calibrationVendorController = {
  list: async (_req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await calibrationVendorService.list());
    } catch (err) {
      next(wrapControllerError(err, "CalibrationVendor.list"));
    }
  },

  create: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const outcome = await runIdempotent(req, "CalibrationVendor.create", (client) =>
        calibrationVendorService
          .createInTxn(client, req.body)
          .then((body) => ({ statusCode: 201, body }))
      );
      res.status(outcome.statusCode).json(outcome.body);
    } catch (err) {
      next(wrapControllerError(err, "CalibrationVendor.create"));
    }
  }
};
