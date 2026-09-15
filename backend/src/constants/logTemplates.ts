export const LOG_TEMPLATES = {
  MeasuringDevice: ["MeasuringDevice.create", "MeasuringDevice.update", "MeasuringDevice.status", "MeasuringDevice.export"],
  CalibrationPlan: ["CalibrationPlan.create", "CalibrationPlan.update", "CalibrationPlan.status", "CalibrationPlan.export"],
  CalibrationCertificate: ["CalibrationCertificate.create", "CalibrationCertificate.update", "CalibrationCertificate.status", "CalibrationCertificate.export"],
  CalibrationVendor: ["CalibrationVendor.create", "CalibrationVendor.update", "CalibrationVendor.status", "CalibrationVendor.export"],
  OverdueAlert: ["OverdueAlert.create", "OverdueAlert.update", "OverdueAlert.status", "OverdueAlert.export"],
  DeviceLifecycle: [
    "DeviceLifecycle.exempt",
    "DeviceLifecycle.expireRestore",
    "DeviceLifecycle.scrap",
    "DeviceLifecycle.scrapConflict",
    "DeviceLifecycle.planRejected",
    "DeviceLifecycle.dueCalibrationQuery"
  ]
};
