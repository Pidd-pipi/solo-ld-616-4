import type { CalibrationCertificate } from "../models/CalibrationCertificate";
import { calibrationCertificateRepository } from "../repositories/CalibrationCertificateRepository";

export const calibrationCertificateService = {
  list: () => calibrationCertificateRepository.findAll(),
  create: (row: CalibrationCertificate) => calibrationCertificateRepository.save(row)
};
