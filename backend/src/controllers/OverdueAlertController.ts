import type { Request, Response, NextFunction } from "express";
import { overdueAlertService } from "../services/OverdueAlertService";
import { wrapControllerError } from "../utils/controllerError";
import { runIdempotent } from "../utils/idempotentRun";

export const overdueAlertController = {
  list: async (_req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await overdueAlertService.list());
    } catch (err) {
      next(wrapControllerError(err, "OverdueAlert.list"));
    }
  },

  create: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const outcome = await runIdempotent(req, "OverdueAlert.create", async () => ({
        statusCode: 201,
        body: await overdueAlertService.create(req.body)
      }));
      res.status(outcome.statusCode).json(outcome.body);
    } catch (err) {
      next(wrapControllerError(err, "OverdueAlert.create"));
    }
  }
};
