/**
 * 校准豁免请求载荷（POST /api/measuring-device/:id/exempt）。
 * 豁免原因和截止日必填；截止日前不进入待校准范围，到期后自动恢复。
 */
export interface DeviceLifecycleExemptPayload {
  reason: string;
  exempt_until: string;
  operated_by?: string;
  now?: string;
}
