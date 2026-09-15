import type { OverdueAlert } from "../models/OverdueAlert";
import { overdueAlertRepository } from "../repositories/OverdueAlertRepository";

export const overdueAlertService = {
  list: () => overdueAlertRepository.findAll(),
  create: (row: OverdueAlert) => overdueAlertRepository.save(row)
};
