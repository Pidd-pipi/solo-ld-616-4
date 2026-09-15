export const PlanStatus = ["PLANNED","ASSIGNED","IN_PROGRESS","CERT_UPLOADED","CLOSED","CANCELLED"] as const;
export type PlanStatus = (typeof PlanStatus)[number];
