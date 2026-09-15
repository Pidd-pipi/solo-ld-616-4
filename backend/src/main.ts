import express from "express";
import cors from "cors";
import { config } from "./config/env";
import {
  startDatabaseBootstrap,
  isDatabaseReady,
  getDatabaseState
} from "./repositories/databaseState";
import { databaseReadyMiddleware } from "./middlewares/databaseReadyMiddleware";
import { authMiddleware } from "./middlewares/authMiddleware";
import { auditLogMiddleware } from "./middlewares/auditLogMiddleware";
import { requestLoggerMiddleware } from "./middlewares/requestLoggerMiddleware";
import { errorHandlerMiddleware } from "./middlewares/errorHandlerMiddleware";
import measuringDeviceRoutes from "./routes/MeasuringDeviceRoutes";
import deviceLifecycleRoutes from "./routes/DeviceLifecycleRoutes";
import calibrationPlanRoutes from "./routes/CalibrationPlanRoutes";
import calibrationCertificateRoutes from "./routes/CalibrationCertificateRoutes";
import calibrationVendorRoutes from "./routes/CalibrationVendorRoutes";
import overdueAlertRoutes from "./routes/OverdueAlertRoutes";

const app = express();
app.use(cors());
app.use(express.json());
app.use(requestLoggerMiddleware);
app.use(authMiddleware);
app.use(auditLogMiddleware);

// /health 始终可答：即使数据库未就绪，进程本身仍存活；database 字段反映当前状态。
app.get("/health", (_req, res) => {
  const { state } = getDatabaseState();
  if (isDatabaseReady()) {
    res.json({ status: "ok", service: "calibration-api", database: "up" });
  } else {
    res.status(503).json({
      status: "degraded",
      service: "calibration-api",
      database: state === "degraded" ? "down" : "initializing"
    });
  }
});

// /api 在数据库未就绪时统一返回可重试 503；恢复后中间件自动放行。
app.use("/api", databaseReadyMiddleware);
app.use("/api/measuring-device", deviceLifecycleRoutes);
app.use("/api/measuring-device", measuringDeviceRoutes);
app.use("/api/calibration-plan", calibrationPlanRoutes);
app.use("/api/calibration-certificate", calibrationCertificateRoutes);
app.use("/api/calibration-vendor", calibrationVendorRoutes);
app.use("/api/overdue-alert", overdueAlertRoutes);
app.use(errorHandlerMiddleware);

// 进程先监听端口，数据库引导在后台无限重试；数据库断开/恢复都不影响进程存活。
const server = app.listen(config.port, () => {
  console.log("calibration-api backend listening on", config.port);
  console.log("[db] starting background bootstrap, serving retryable 503 until database is ready");
  startDatabaseBootstrap();
});

const shutdown = async () => {
  server.close(() => process.exit(0));
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
