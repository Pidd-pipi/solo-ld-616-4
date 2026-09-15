import type { QueryResultRow } from "pg";
import type { CalibrationPlan } from "../models/CalibrationPlan";
import { IN_PROGRESS_PLAN_STATUS } from "../constants/PlanStatus";
import { query, clientQuery, type DbClient } from "./db";
import { mapCalibrationPlan } from "./rowMappers";

const PLAN_COLUMNS =
  "id, device_id, planned_date, plan_type, priority, status, assigned_vendor_id, created_by";

export const calibrationPlanRepository = {
  findAll: async (): Promise<CalibrationPlan[]> => {
    const result = await query<QueryResultRow>(
      `SELECT ${PLAN_COLUMNS} FROM calibration_plan ORDER BY id`
    );
    return result.rows.map(mapCalibrationPlan);
  },

  findById: async (id: number): Promise<CalibrationPlan | null> => {
    const result = await query<QueryResultRow>(
      `SELECT ${PLAN_COLUMNS} FROM calibration_plan WHERE id = $1`,
      [id]
    );
    return result.rows[0] ? mapCalibrationPlan(result.rows[0]) : null;
  },

  findByDeviceId: async (deviceId: number): Promise<CalibrationPlan[]> => {
    const result = await query<QueryResultRow>(
      `SELECT ${PLAN_COLUMNS} FROM calibration_plan WHERE device_id = $1 ORDER BY id`,
      [deviceId]
    );
    return result.rows.map(mapCalibrationPlan);
  },

  /**
   * 事务内统计设备进行中计划数量；用于报废冲突判定，与设备行锁共享同一快照。
   */
  countInProgressByDeviceId: async (client: DbClient, deviceId: number): Promise<number> => {
    const result = await clientQuery<QueryResultRow>(
      client,
      `SELECT COUNT(*)::int AS count FROM calibration_plan
       WHERE device_id = $1 AND status = ANY($2)`,
      [deviceId, IN_PROGRESS_PLAN_STATUS]
    );
    return Number(result.rows[0].count);
  },

  insert: async (
    client: DbClient,
    input: {
      device_id: number;
      planned_date: string;
      plan_type: string;
      priority: string;
      status: string;
      assigned_vendor_id: number;
      created_by: string;
    }
  ): Promise<CalibrationPlan> => {
    const result = await clientQuery<QueryResultRow>(
      client,
      `INSERT INTO calibration_plan
         (device_id, planned_date, plan_type, priority, status, assigned_vendor_id, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING ${PLAN_COLUMNS}`,
      [
        input.device_id,
        input.planned_date,
        input.plan_type,
        input.priority,
        input.status,
        input.assigned_vendor_id,
        input.created_by
      ]
    );
    return mapCalibrationPlan(result.rows[0]);
  }
};
