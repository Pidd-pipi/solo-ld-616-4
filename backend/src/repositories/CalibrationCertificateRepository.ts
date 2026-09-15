import { seed } from "../seed"; export const calibrationCertificateRepository = { findAll: () => seed.calibrationCertificate, save: (row: unknown) => row };
