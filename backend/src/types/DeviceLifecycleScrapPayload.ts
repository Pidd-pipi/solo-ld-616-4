/**
 * 报废请求载荷（POST /api/measuring-device/:id/scrap）。
 * 报废为终态，仅在没有进行中计划时允许。
 */
export interface DeviceLifecycleScrapPayload {
  reason?: string;
  operated_by?: string;
  now?: string;
}
