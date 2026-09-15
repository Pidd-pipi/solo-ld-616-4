export const CertificateResult = ["PASS","LIMITED_PASS","FAIL","NEED_REPAIR"] as const;
export type CertificateResult = (typeof CertificateResult)[number];
