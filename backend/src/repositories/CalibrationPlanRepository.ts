import { seed } from "../seed"; export const calibrationPlanRepository = { findAll: () => seed.calibrationPlan, save: (row: unknown) => row };
