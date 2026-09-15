import type { QueryResultRow } from "pg";
import type { MeasuringDevice } from "../models/MeasuringDevice";
import type { DeviceLifecycleStatus } from "../constants/DeviceLifecycleStatus";
import { query, clientQuery, type DbClient } from "./db";
import { mapMeasuringDevice } from "./rowMappers";

const DEVICE_COLUMNS =
  "id, device_code, name, device_type, accuracy_level, owner_dept, calibration_cycle_days, status, lifecycle_status, exempt_reason, exempt_until";

export const measuringDeviceRepository = {
  findAll: async (): Promise<MeasuringDevice[]> => {
    const result = await query<QueryResultRow>(`SELECT ${DEVICE_COLUMNS} FROM measuring_device ORDER BY id`);
    return result.rows.map(mapMeasuringDevice);
  },

  findById: async (id: number): Promise<MeasuringDevice | null> => {
    const result = await query<QueryResultRow>(
      `SELECT ${DEVICE_COLUMNS} FROM measuring_device WHERE id = $1`,
      [id]
    );
    return result.rows[0] ? mapMeasuringDevice(result.rows[0]) : null;
  },

  findByIdForUpdate: async (client: DbClient, id: number): Promise<MeasuringDevice | null> => {
    const result = await clientQuery<QueryResultRow>(
      client,
      `SELECT ${DEVICE_COLUMNS} FROM measuring_device WHERE id = $1 FOR UPDATE`,
      [id]
    );
    return result.rows[0] ? mapMeasuringDevice(result.rows[0]) : null;
  },

  /**
   * 锁定所有仍处于豁免期但已到截止日的设备，供一个事务内批量到期恢复。
   */
  findExpiredExemptForUpdate: async (client: DbClient, nowIso: string): Promise<MeasuringDevice[]> => {
    const result = await clientQuery<QueryResultRow>(
      client,
      `SELECT ${DEVICE_COLUMNS} FROM measuring_device
       WHERE lifecycle_status = 'EXEMPT' AND exempt_until IS NOT NULL AND exempt_until <= $1
       ORDER BY id FOR UPDATE`,
      [nowIso]
    );
    return result.rows.map(mapMeasuringDevice);
  },

  insert: async (input: {
    device_code: string;
    name: string;
    device_type?: string;
    accuracy_level?: string;
    owner_dept?: string;
    calibration_cycle_days?: number;
    status?: string;
  }): Promise<MeasuringDevice> => {
    const result = await query<QueryResultRow>(
      `INSERT INTO measuring_device
         (device_code, name, device_type, accuracy_level, owner_dept, calibration_cycle_days, status, lifecycle_status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'ACTIVE')
       RETURNING ${DEVICE_COLUMNS}`,
      [
        input.device_code,
        input.name,
        input.device_type ?? "",
        input.accuracy_level ?? "",
        input.owner_dept ?? "",
        input.calibration_cycle_days ?? 365,
        input.status ?? "VALID"
      ]
    );
    return mapMeasuringDevice(result.rows[0]);
  },

  /**
   * 生命周期状态原子写回，必须在已持有该行行锁的事务内调用。
   */
  updateLifecycle: async (
    client: DbClient,
    id: number,
    fields: {
      lifecycle_status: DeviceLifecycleStatus;
      exempt_reason?: string | null;
      exempt_until?: string | null;
      status?: string;
    }
  ): Promise<MeasuringDevice> => {
    const result = await clientQuery<QueryResultRow>(
      client,
      `UPDATE measuring_device SET
         lifecycle_status = $2,
         exempt_reason = $3,
         exempt_until = $4,
         status = COALESCE($5, status)
       WHERE id = $1 RETURNING ${DEVICE_COLUMNS}`,
      [
        id,
        fields.lifecycle_status,
        fields.exempt_reason ?? null,
        fields.exempt_until ?? null,
        fields.status ?? null
      ]
    );
    return mapMeasuringDevice(result.rows[0]);
  }
};
