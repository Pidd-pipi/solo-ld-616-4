import type { Request, Response, NextFunction } from "express";
import { calibrationCertificateService } from "../services/CalibrationCertificateService";
import { wrapControllerError } from "../utils/controllerError";
import { runIdempotent } from "../utils/idempotentRun";

export const calibrationCertificateController = {
  list: async (_req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await calibrationCertificateService.list());
    } catch (err) {
      next(wrapControllerError(err, "CalibrationCertificate.list"));
    }
  },

  create: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const outcome = await runIdempotent(req, "CalibrationCertificate.create", (client) =>
        calibrationCertificateService
          .createInTxn(client, req.body)
          .then((body) => ({ statusCode: 201, body }))
      );
      res.status(outcome.statusCode).json(outcome.body);
    } catch (err) {
      next(wrapControllerError(err, "CalibrationCertificate.create"));
    }
  }
};
