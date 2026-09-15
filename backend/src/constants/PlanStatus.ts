export const PlanStatus = ["PLANNED","ASSIGNED","IN_PROGRESS","CERT_UPLOADED","CLOSED","CANCELLED"] as const;
export type PlanStatus = (typeof PlanStatus)[number];

/**
 * 进行中（未关闭、未取消）的计划状态。
 * 报废设备前必须确认该设备不存在处于这些状态的计划，否则保持原状态并返回冲突。
 */
export const IN_PROGRESS_PLAN_STATUS: ReadonlyArray<PlanStatus> = ["PLANNED", "ASSIGNED", "IN_PROGRESS", "CERT_UPLOADED"];
