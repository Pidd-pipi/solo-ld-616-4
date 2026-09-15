export const seed = {
  "measuringDevice": [
    {
      "id": 1,
      "device_code": "device code 1",
      "name": "name 1",
      "device_type": "DUE_SOON",
      "accuracy_level": "LOW",
      "owner_dept": "owner dept 1",
      "calibration_cycle_days": "calibration cycle days 1",
      "status": "DUE_SOON"
    },
    {
      "id": 2,
      "device_code": "device code 2",
      "name": "name 2",
      "device_type": "OVERDUE",
      "accuracy_level": "MEDIUM",
      "owner_dept": "owner dept 2",
      "calibration_cycle_days": "calibration cycle days 2",
      "status": "OVERDUE"
    },
    {
      "id": 3,
      "device_code": "device code 3",
      "name": "name 3",
      "device_type": "CALIBRATING",
      "accuracy_level": "HIGH",
      "owner_dept": "owner dept 3",
      "calibration_cycle_days": "calibration cycle days 3",
      "status": "VALID"
    }
  ],
  "calibrationPlan": [
    {
      "id": 1,
      "device_id": 1,
      "planned_date": "2026-06-11T09:00:00Z",
      "plan_type": "DUE_SOON",
      "priority": "priority 1",
      "status": "DUE_SOON",
      "assigned_vendor_id": 1,
      "created_by": "created by 1"
    },
    {
      "id": 2,
      "device_id": 2,
      "planned_date": "2026-06-12T09:00:00Z",
      "plan_type": "OVERDUE",
      "priority": "priority 2",
      "status": "OVERDUE",
      "assigned_vendor_id": 2,
      "created_by": "created by 2"
    },
    {
      "id": 3,
      "device_id": 3,
      "planned_date": "2026-06-13T09:00:00Z",
      "plan_type": "CALIBRATING",
      "priority": "priority 3",
      "status": "VALID",
      "assigned_vendor_id": 3,
      "created_by": "created by 3"
    }
  ],
  "calibrationCertificate": [
    {
      "id": 1,
      "device_id": 1,
      "plan_id": 1,
      "certificate_no": "certificate no 1",
      "result_status": "DUE_SOON",
      "valid_until": "valid until 1",
      "file_path": "file path 1",
      "issued_by": "issued by 1"
    },
    {
      "id": 2,
      "device_id": 2,
      "plan_id": 2,
      "certificate_no": "certificate no 2",
      "result_status": "OVERDUE",
      "valid_until": "valid until 2",
      "file_path": "file path 2",
      "issued_by": "issued by 2"
    },
    {
      "id": 3,
      "device_id": 3,
      "plan_id": 3,
      "certificate_no": "certificate no 3",
      "result_status": "VALID",
      "valid_until": "valid until 3",
      "file_path": "file path 3",
      "issued_by": "issued by 3"
    }
  ],
  "calibrationVendor": [
    {
      "id": 1,
      "vendor_name": "vendor name 1",
      "qualification_no": "qualification no 1",
      "contact_phone": "13800000001",
      "service_scope": "service scope 1",
      "vendor_status": "DUE_SOON"
    },
    {
      "id": 2,
      "vendor_name": "vendor name 2",
      "qualification_no": "qualification no 2",
      "contact_phone": "13800000002",
      "service_scope": "service scope 2",
      "vendor_status": "OVERDUE"
    },
    {
      "id": 3,
      "vendor_name": "vendor name 3",
      "qualification_no": "qualification no 3",
      "contact_phone": "13800000003",
      "service_scope": "service scope 3",
      "vendor_status": "VALID"
    }
  ],
  "overdueAlert": [
    {
      "id": 1,
      "device_id": 1,
      "plan_id": 1,
      "alert_level": "LOW",
      "alert_reason": "alert reason 1",
      "handled_by": "handled by 1",
      "handled_at": "2026-06-11T09:00:00Z",
      "status": "DUE_SOON"
    },
    {
      "id": 2,
      "device_id": 2,
      "plan_id": 2,
      "alert_level": "MEDIUM",
      "alert_reason": "alert reason 2",
      "handled_by": "handled by 2",
      "handled_at": "2026-06-12T09:00:00Z",
      "status": "OVERDUE"
    },
    {
      "id": 3,
      "device_id": 3,
      "plan_id": 3,
      "alert_level": "HIGH",
      "alert_reason": "alert reason 3",
      "handled_by": "handled by 3",
      "handled_at": "2026-06-13T09:00:00Z",
      "status": "VALID"
    }
  ]
} as const;
