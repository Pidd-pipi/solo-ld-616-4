import { seed } from "../seed"; export const overdueAlertRepository = { findAll: () => seed.overdueAlert, save: (row: unknown) => row };
