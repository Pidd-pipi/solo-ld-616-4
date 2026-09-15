import type { QueryResultRow } from "pg";
import type { OverdueAlert } from "../models/OverdueAlert";
import { query, clientQuery, type DbClient } from "./db";
import { mapOverdueAlert } from "./rowMappers";

const ALERT_COLUMNS =
  "id, device_id, plan_id, alert_level, alert_reason, handled_by, handled_at, status";

export const overdueAlertRepository = {
  findAll: async (): Promise<OverdueAlert[]> => {
    const result = await query<QueryResultRow>(
      `SELECT ${ALERT_COLUMNS} FROM overdue_alert ORDER BY id`
    );
    return result.rows.map(mapOverdueAlert);
  },

  insert: async (
    client: DbClient,
    input: {
      device_id: number;
      plan_id: number;
      alert_level: string;
      alert_reason: string;
      handled_by: string;
      handled_at: string | null;
      status: string;
    }
  ): Promise<OverdueAlert> => {
    const result = await clientQuery<QueryResultRow>(
      client,
      `INSERT INTO overdue_alert
         (device_id, plan_id, alert_level, alert_reason, handled_by, handled_at, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING ${ALERT_COLUMNS}`,
      [
        input.device_id,
        input.plan_id,
        input.alert_level,
        input.alert_reason,
        input.handled_by,
        input.handled_at,
        input.status
      ]
    );
    return mapOverdueAlert(result.rows[0]);
  }
};
