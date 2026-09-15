CREATE TABLE IF NOT EXISTS measuring_device (
  id INTEGER PRIMARY KEY,
  device_code TEXT,
  name TEXT,
  device_type TEXT,
  accuracy_level TEXT,
  owner_dept TEXT,
  calibration_cycle_days TEXT,
  status TEXT
);

CREATE TABLE IF NOT EXISTS calibration_plan (
  id INTEGER PRIMARY KEY,
  device_id TEXT,
  planned_date TEXT,
  plan_type TEXT,
  priority TEXT,
  status TEXT,
  assigned_vendor_id TEXT,
  created_by TEXT
);

CREATE TABLE IF NOT EXISTS calibration_certificate (
  id INTEGER PRIMARY KEY,
  device_id TEXT,
  plan_id TEXT,
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
  device_id TEXT,
  plan_id TEXT,
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
