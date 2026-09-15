import { seed } from "../seed"; export const measuringDeviceRepository = { findAll: () => seed.measuringDevice, save: (row: unknown) => row };
