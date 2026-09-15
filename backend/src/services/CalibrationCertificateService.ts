import type { CalibrationCertificate } from "../models/CalibrationCertificate";
import { withTransaction } from "../repositories/db";
import { calibrationCertificateRepository } from "../repositories/CalibrationCertificateRepository";

export const calibrationCertificateService = {
  list: async (): Promise<CalibrationCertificate[]> =>
    calibrationCertificateRepository.findAll(),

  create: async (row: Omit<CalibrationCertificate, "id">): Promise<CalibrationCertificate> =>
    withTransaction((client) =>
      calibrationCertificateRepository.insert(client, {
        device_id: row.device_id,
        plan_id: row.plan_id,
        certificate_no: row.certificate_no,
        result_status: row.result_status,
        valid_until: row.valid_until,
        file_path: row.file_path,
        issued_by: row.issued_by
      })
    )
};
