import { seed } from "../seed"; export const calibrationVendorRepository = { findAll: () => seed.calibrationVendor, save: (row: unknown) => row };
