import type { QueryResultRow } from "pg";
import type { DeviceLifecycleRecord } from "../models/DeviceLifecycleRecord";
import type { DeviceLifecycleAction } from "../constants/DeviceLifecycleAction";
import type { DeviceLifecycleStatus } from "../constants/DeviceLifecycleStatus";
import { query, clientQuery, type DbClient } from "./db";
import { mapDeviceLifecycleRecord } from "./rowMappers";

const RECORD_COLUMNS =
  "id, device_id, action, from_status, to_status, reason, exempt_until, operated_by, created_at";

/**
 * 生命周期变更记录：仅追加（INSERT），不提供 UPDATE/DELETE，历史不可变。
 */
export const deviceLifecycleRecordRepository = {
  findByDeviceId: async (deviceId: number): Promise<DeviceLifecycleRecord[]> => {
    const result = await query<QueryResultRow>(
      `SELECT ${RECORD_COLUMNS} FROM device_lifecycle_record
       WHERE device_id = $1 ORDER BY created_at DESC, id DESC`,
      [deviceId]
    );
    return result.rows.map(mapDeviceLifecycleRecord);
  },

  findLatestByDeviceId: async (deviceId: number): Promise<DeviceLifecycleRecord | null> => {
    const result = await query<QueryResultRow>(
      `SELECT ${RECORD_COLUMNS} FROM device_lifecycle_record
       WHERE device_id = $1 ORDER BY created_at DESC, id DESC LIMIT 1`,
      [deviceId]
    );
    return result.rows[0] ? mapDeviceLifecycleRecord(result.rows[0]) : null;
  },

  append: async (
    client: DbClient,
    fields: {
      device_id: number;
      action: DeviceLifecycleAction;
      from_status: DeviceLifecycleStatus;
      to_status: DeviceLifecycleStatus;
      reason: string | null;
      exempt_until: string | null;
      operated_by: string | null;
      created_at: string;
    }
  ): Promise<DeviceLifecycleRecord> => {
    const result = await clientQuery<QueryResultRow>(
      client,
      `INSERT INTO device_lifecycle_record
         (device_id, action, from_status, to_status, reason, exempt_until, operated_by, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING ${RECORD_COLUMNS}`,
      [
        fields.device_id,
        fields.action,
        fields.from_status,
        fields.to_status,
        fields.reason,
        fields.exempt_until,
        fields.operated_by,
        fields.created_at
      ]
    );
    return mapDeviceLifecycleRecord(result.rows[0]);
  }
};
