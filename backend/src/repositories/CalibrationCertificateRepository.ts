import type { CalibrationCertificate } from "../models/CalibrationCertificate";
import { inMemoryStore } from "./inMemoryStore";

export const calibrationCertificateRepository = {
  findAll: (): CalibrationCertificate[] => inMemoryStore.table("calibrationCertificate"),

  findByDeviceId: (deviceId: number): CalibrationCertificate[] =>
    inMemoryStore.table("calibrationCertificate").filter((row) => row.device_id === deviceId),

  save: (row: CalibrationCertificate): CalibrationCertificate => {
    inMemoryStore.table("calibrationCertificate").push(row);
    return row;
  },

  nextId: (): number => inMemoryStore.nextId("calibrationCertificate")
};
