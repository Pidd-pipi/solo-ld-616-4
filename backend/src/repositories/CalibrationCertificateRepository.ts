import type { QueryResultRow } from "pg";
import type { CalibrationCertificate } from "../models/CalibrationCertificate";
import { query, clientQuery, type DbClient } from "./db";
import { mapCalibrationCertificate } from "./rowMappers";

const CERTIFICATE_COLUMNS =
  "id, device_id, plan_id, certificate_no, result_status, valid_until, file_path, issued_by";

export const calibrationCertificateRepository = {
  findAll: async (): Promise<CalibrationCertificate[]> => {
    const result = await query<QueryResultRow>(
      `SELECT ${CERTIFICATE_COLUMNS} FROM calibration_certificate ORDER BY id`
    );
    return result.rows.map(mapCalibrationCertificate);
  },

  findByDeviceId: async (deviceId: number): Promise<CalibrationCertificate[]> => {
    const result = await query<QueryResultRow>(
      `SELECT ${CERTIFICATE_COLUMNS} FROM calibration_certificate WHERE device_id = $1 ORDER BY id`,
      [deviceId]
    );
    return result.rows.map(mapCalibrationCertificate);
  },

  insert: async (
    client: DbClient,
    input: {
      device_id: number;
      plan_id: number;
      certificate_no: string;
      result_status: string;
      valid_until: string;
      file_path: string;
      issued_by: string;
    }
  ): Promise<CalibrationCertificate> => {
    const result = await clientQuery<QueryResultRow>(
      client,
      `INSERT INTO calibration_certificate
         (device_id, plan_id, certificate_no, result_status, valid_until, file_path, issued_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING ${CERTIFICATE_COLUMNS}`,
      [
        input.device_id,
        input.plan_id,
        input.certificate_no,
        input.result_status,
        input.valid_until,
        input.file_path,
        input.issued_by
      ]
    );
    return mapCalibrationCertificate(result.rows[0]);
  }
};
