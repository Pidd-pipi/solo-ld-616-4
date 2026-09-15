import type { CalibrationVendor } from "../models/CalibrationVendor";
import { inMemoryStore } from "./inMemoryStore";

export const calibrationVendorRepository = {
  findAll: (): CalibrationVendor[] => inMemoryStore.table("calibrationVendor"),

  save: (row: CalibrationVendor): CalibrationVendor => {
    inMemoryStore.table("calibrationVendor").push(row);
    return row;
  },

  nextId: (): number => inMemoryStore.nextId("calibrationVendor")
};
