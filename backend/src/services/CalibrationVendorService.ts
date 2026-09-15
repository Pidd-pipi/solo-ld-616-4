import type { CalibrationVendor } from "../models/CalibrationVendor";
import { withTransaction } from "../repositories/db";
import { calibrationVendorRepository } from "../repositories/CalibrationVendorRepository";

export const calibrationVendorService = {
  list: async (): Promise<CalibrationVendor[]> => calibrationVendorRepository.findAll(),

  create: async (row: Omit<CalibrationVendor, "id">): Promise<CalibrationVendor> =>
    withTransaction((client) =>
      calibrationVendorRepository.insert(client, {
        vendor_name: row.vendor_name,
        qualification_no: row.qualification_no,
        contact_phone: row.contact_phone,
        service_scope: row.service_scope,
        vendor_status: row.vendor_status
      })
    )
};
