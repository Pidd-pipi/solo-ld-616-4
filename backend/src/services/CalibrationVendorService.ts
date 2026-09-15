import type { CalibrationVendor } from "../models/CalibrationVendor";
import { calibrationVendorRepository } from "../repositories/CalibrationVendorRepository";

export const calibrationVendorService = {
  list: () => calibrationVendorRepository.findAll(),
  create: (row: CalibrationVendor) => calibrationVendorRepository.save(row)
};
