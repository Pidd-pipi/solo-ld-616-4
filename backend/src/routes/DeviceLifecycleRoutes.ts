import { Router } from "express";
import { deviceLifecycleController } from "../controllers/DeviceLifecycleController";

/**
 * 设备生命周期路由，挂在 /api/measuring-device 之下：
 * - GET  /due-calibration     当前待校准范围（豁免有效期内/报废设备不返回）
 * - POST /:id/exempt          校准豁免（body: reason, exempt_until）
 * - POST /:id/scrap           报废（有进行中计划时 409，设备保持原状态）
 * 到期恢复无独立接口，在任意设备读取时按截止日自动执行。
 */
const router = Router();

router.get("/due-calibration", deviceLifecycleController.listDueCalibration);
router.post("/:id/exempt", deviceLifecycleController.exempt);
router.post("/:id/scrap", deviceLifecycleController.scrap);

export default router;
