import type { QueryResultRow } from "pg";
import type { CalibrationVendor } from "../models/CalibrationVendor";
import { query, clientQuery, type DbClient } from "./db";
import { mapCalibrationVendor } from "./rowMappers";

const VENDOR_COLUMNS =
  "id, vendor_name, qualification_no, contact_phone, service_scope, vendor_status";

export const calibrationVendorRepository = {
  findAll: async (): Promise<CalibrationVendor[]> => {
    const result = await query<QueryResultRow>(
      `SELECT ${VENDOR_COLUMNS} FROM calibration_vendor ORDER BY id`
    );
    return result.rows.map(mapCalibrationVendor);
  },

  insert: async (
    client: DbClient,
    input: {
      vendor_name: string;
      qualification_no: string;
      contact_phone: string;
      service_scope: string;
      vendor_status: string;
    }
  ): Promise<CalibrationVendor> => {
    const result = await clientQuery<QueryResultRow>(
      client,
      `INSERT INTO calibration_vendor
         (vendor_name, qualification_no, contact_phone, service_scope, vendor_status)
       VALUES ($1,$2,$3,$4,$5) RETURNING ${VENDOR_COLUMNS}`,
      [
        input.vendor_name,
        input.qualification_no,
        input.contact_phone,
        input.service_scope,
        input.vendor_status
      ]
    );
    return mapCalibrationVendor(result.rows[0]);
  }
};
