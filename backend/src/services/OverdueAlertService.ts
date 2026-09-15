import type { OverdueAlert } from "../models/OverdueAlert";
import { withTransaction, type DbClient } from "../repositories/db";
import { overdueAlertRepository } from "../repositories/OverdueAlertRepository";

export const overdueAlertService = {
  list: async (): Promise<OverdueAlert[]> => overdueAlertRepository.findAll(),

  create: async (row: Omit<OverdueAlert, "id">): Promise<OverdueAlert> =>
    withTransaction((client) => overdueAlertService.createInTxn(client, row)),

  createInTxn: async (
    client: DbClient,
    row: Omit<OverdueAlert, "id">
  ): Promise<OverdueAlert> =>
    overdueAlertRepository.insert(client, {
      device_id: row.device_id,
      plan_id: row.plan_id,
      alert_level: row.alert_level,
      alert_reason: row.alert_reason,
      handled_by: row.handled_by,
      handled_at: row.handled_at,
      status: row.status
    })
};
