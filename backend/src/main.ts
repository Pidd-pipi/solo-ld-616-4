import express from "express";
import cors from "cors";
import { config } from "./config/env";
import { bootstrapDatabase } from "./repositories/schema";
import { waitForDatabase, closeDatabase, query } from "./repositories/db";
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

// /health 同时反映数据库连通性；数据库不可用时返回 503，而不是假装健康。
app.get("/health", async (_req, res) => {
  try {
    await query("SELECT 1 AS ok");
    res.json({ status: "ok", service: "calibration-api", database: "up" });
  } catch {
    res.status(503).json({ status: "degraded", service: "calibration-api", database: "down" });
  }
});

app.use("/api/measuring-device", deviceLifecycleRoutes);
app.use("/api/measuring-device", measuringDeviceRoutes);
app.use("/api/calibration-plan", calibrationPlanRoutes);
app.use("/api/calibration-certificate", calibrationCertificateRoutes);
app.use("/api/calibration-vendor", calibrationVendorRoutes);
app.use("/api/overdue-alert", overdueAlertRoutes);
app.use(errorHandlerMiddleware);

/**
 * 启动顺序必须是：等待数据库 → 幂等建表/种子 → 监听端口。
 * 数据库不可达时直接非零退出，绝不在空内存上提供会丢数据的服务。
 */
const start = async (): Promise<void> => {
  await waitForDatabase();
  await bootstrapDatabase();
  const server = app.listen(config.port, () =>
    console.log("calibration-api backend listening on", config.port)
  );

  const shutdown = async () => {
    server.close(() => void 0);
    await closeDatabase().catch(() => undefined);
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
};

start().catch((err) => {
  console.error("[startup] failed to initialize database, aborting:", err);
  process.exit(1);
});
