CREATE TABLE IF NOT EXISTS measuring_device (
  id INTEGER PRIMARY KEY,
  device_code TEXT,
  name TEXT,
  device_type TEXT,
  accuracy_level TEXT,
  owner_dept TEXT,
  calibration_cycle_days INTEGER,
  status TEXT,
  -- 生命周期：ACTIVE 在役 / EXEMPT 校准豁免 / SCRAPPED 已报废（终态）
  lifecycle_status TEXT NOT NULL DEFAULT 'ACTIVE',
  exempt_reason TEXT,
  exempt_until TEXT
);

CREATE TABLE IF NOT EXISTS calibration_plan (
  id INTEGER PRIMARY KEY,
  device_id INTEGER,
  planned_date TEXT,
  plan_type TEXT,
  priority TEXT,
  status TEXT,
  assigned_vendor_id INTEGER,
  created_by TEXT
);

CREATE TABLE IF NOT EXISTS calibration_certificate (
  id INTEGER PRIMARY KEY,
  device_id INTEGER,
  plan_id INTEGER,
  certificate_no TEXT,
  result_status TEXT,
  valid_until TEXT,
  file_path TEXT,
  issued_by TEXT
);

CREATE TABLE IF NOT EXISTS calibration_vendor (
  id INTEGER PRIMARY KEY,
  vendor_name TEXT,
  qualification_no TEXT,
  contact_phone TEXT,
  service_scope TEXT,
  vendor_status TEXT
);

CREATE TABLE IF NOT EXISTS overdue_alert (
  id INTEGER PRIMARY KEY,
  device_id INTEGER,
  plan_id INTEGER,
  alert_level TEXT,
  alert_reason TEXT,
  handled_by TEXT,
  handled_at TEXT,
  status TEXT
);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY,
  actor TEXT,
  action TEXT,
  target_type TEXT,
  target_id TEXT,
  created_at TEXT
);

-- 设备生命周期变更记录：仅追加，不改写计划与证书历史。
-- action: EXEMPT 豁免 / EXPIRE_RESTORE 到期自动恢复 / SCRAP 报废
CREATE TABLE IF NOT EXISTS device_lifecycle_record (
  id INTEGER PRIMARY KEY,
  device_id INTEGER NOT NULL,
  action TEXT NOT NULL,
  from_status TEXT NOT NULL,
  to_status TEXT NOT NULL,
  reason TEXT,
  exempt_until TEXT,
  operated_by TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_device_lifecycle_record_device_id
  ON device_lifecycle_record (device_id, created_at DESC);
