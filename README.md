# 设备计量校准排期 API 服务

面向实验室和工厂的计量设备校准周期管理 API，覆盖设备台账、校准计划、证书、超期预警和外部机构管理。

## 快速启动

```bash
cp .env.example .env && docker compose up -d
```

## 访问地址或 CLI 示例

后端健康检查：<http://localhost:21116/health>

后端健康检查：<http://localhost:21116/health>


## 本地开发方式


- 后端：进入 `backend` 后按技术栈运行开发命令，接口统一挂在 `/api`。


## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | - |
| 后端 | NestJS + TypeScript + TypeORM |
| 数据库 | PostgreSQL 15 |
| 部署 | Docker Compose |

## 项目目录结构

```text

backend/src/routes, controllers, services, models, repositories, middlewares, constants, constructors, utils, types, config
```

## 环境变量说明

- `COMPOSE_PROJECT_NAME`: Compose 项目名，默认 `calibration-api`

- `BACKEND_PORT`: 后端端口，默认 `21116`
- `DB_PORT`: 数据库宿主机端口
- `DB_USER/DB_PASSWORD/DB_NAME`: 本地数据库凭据
- `DB_HOST`: 数据库主机，容器内为 `db`，本地直连默认 `localhost`
- `JWT_SECRET`: JWT 签名密钥
- `DB_CONNECT_RETRIES / DB_CONNECT_RETRY_DELAY_MS`: 启动等待数据库就绪的重试次数与间隔；重试耗尽则非零退出，不回退内存存储

## Docker 部署说明

- 根 Compose 文件不写 `version`，顶层 `name: calibration-api`。
- 容器名均使用 `${COMPOSE_PROJECT_NAME:-calibration-api}` 前缀。
- 数据库使用命名卷，避免绑定中文路径。
- 常见问题：端口占用时修改 `.env` 中端口后重启；需要重置数据时执行 `docker compose down -v`。

## 设备生命周期：校准豁免 / 到期恢复 / 报废

在原有设备建档、查询流程不变的前提下，台账新增生命周期能力。生命周期（`lifecycle_status`）与校准状态（`status`）相互独立：

| 生命周期状态 | 含义 | 对待校准范围 / 新建计划的影响 |
|---|---|---|
| `ACTIVE` | 在役（默认） | 正常进入待校准范围，允许新建计划 |
| `EXEMPT` | 校准豁免（带原因和截止日） | 截止日前**不进入待校准范围**；期间新建计划返回 409 |
| `SCRAPPED` | 已报废（**终态**） | 不进入待校准范围；任何新建计划返回 409，不可再豁免/报废 |

- **豁免** `POST /api/measuring-device/:id/exempt`，请求体 `{ "reason": "封存待处置", "exempt_until": "2026-12-31T00:00:00Z" }`，必须提供原因和晚于当前时间的截止日。
- **到期恢复**：无独立接口。豁免超过 `exempt_until` 后，设备在下一次被读取（台账列表、详情、待校准查询、新建计划校验）时**自动恢复**为 `ACTIVE`，清空豁免原因/截止日，并追加一条 `EXPIRE_RESTORE` 变更记录。
- **报废** `POST /api/measuring-device/:id/scrap`，请求体 `{ "reason": "损坏" }`（原因可选）。仅当该设备**没有进行中计划**（计划状态为 `PLANNED/ASSIGNED/IN_PROGRESS/CERT_UPLOADED`）时允许；否则设备**保持原状态**、不写任何变更记录，返回 `409 DEVICE_SCRAP_PLAN_CONFLICT`。
- **待校准范围** `GET /api/measuring-device/due-calibration`：返回校准状态为 `DUE_SOON/OVERDUE` 且当前生命周期为 `ACTIVE` 的设备（豁免有效期内、已报废均不返回）。
- 豁免与报废**只改设备行的生命周期列并追加变更记录**，不改写任何校准计划和证书历史。
- `GET /api/measuring-device/` 的每条记录同时返回生命周期、校准状态和最近一次变更记录（`lifecycle_status` / `status` / `exempt_reason` / `exempt_until` / `last_lifecycle_change`）。

```bash
# 豁免
curl -X POST http://localhost:21116/api/measuring-device/2/exempt \
  -H 'content-type: application/json' \
  -d '{"reason":"封存待处置","exempt_until":"2026-12-31T00:00:00Z"}'
# 报废（有进行中计划时返回 409 且设备状态不变）
curl -X POST http://localhost:21116/api/measuring-device/3/scrap \
  -H 'content-type: application/json' -d '{"reason":"损坏"}'
# 待校准范围（自动触发到期恢复）
curl http://localhost:21116/api/measuring-device/due-calibration
```

冲突相关错误码：`DEVICE_NOT_FOUND`(404)、`DEVICE_ALREADY_SCRAPPED`(409)、`DEVICE_ALREADY_EXEMPT`(409)、`DEVICE_SCRAP_PLAN_CONFLICT`(409)、`PLAN_DEVICE_SCRAPPED`(409)、`PLAN_DEVICE_EXEMPT`(409)、`DEVICE_CODE_DUPLICATED`(409)、`IDEMPOTENCY_REPLAY_PENDING`(409)、`PERSISTENCE_FAILED`(503)、`VALIDATION_FAILED`(400)。

## 持久化与幂等

- 所有写入（建档、豁免、到期恢复、报废、新建计划/证书/预警）都直接落 **PostgreSQL**，进程内不再保留业务可变状态；服务重启后豁免、报废、新增设备和变更记录仍可查到，计划、证书、预警数量不随重启变化。
- 启动顺序固定为：等待数据库就绪 → 幂等建表（`repositories/schema.ts`，与 `database/init.sql` 对齐）→ `ON CONFLICT DO NOTHING` 幂等种子并校正 identity 序列 → 监听端口。数据库不可达时启动直接失败（退出码 1），`/health` 在数据库异常时返回 503。
- 生命周期写操作在事务内对设备行 `SELECT ... FOR UPDATE`：状态判定、进行中计划计数、设备更新、变更记录追加原子提交；写库失败整体回滚并返回 `503 PERSISTENCE_FAILED`，不会出现“只改内存后报告成功”。
- **写接口幂等**：对建档、豁免、报废、新建计划/证书/预警在请求头带 `Idempotency-Key: <任意唯一串>`，同一 key 的重复或并发请求只落一次库并返回首次结果（存于 `idempotency_record` 表），不会生成两条相同记录。不带该头则按普通请求处理；`device_code` 上还有数据库唯一约束兜底重复建档。

```bash
# 同一豁免重复提交两次，只产生一条 EXEMPT 记录
for i in 1 2; do
  curl -s -o /dev/null -w '%{http_code}\n' -X POST \
    http://localhost:21116/api/measuring-device/1/exempt \
    -H 'content-type: application/json' -H 'Idempotency-Key: exempt-dev1-2026q4' \
    -d '{"reason":"封存待处置","exempt_until":"2026-12-31T00:00:00Z"}'
done
```

## 枚举/常量出现位置清单

- DeviceCalibrationStatus: constants/DeviceCalibrationStatus、types/DeviceCalibrationStatus、constructors、logTemplates、errorMessages、筛选器、展示组件/控制器均有引用。
  - 新增引用：`constants/DeviceCalibrationStatus.ts` 内 `PENDING_CALIBRATION_STATUS`（待校准范围）、`utils/formatters.ts`（状态文案/判定）、`models/MeasuringDevice.ts`、`constructors/MeasuringDeviceDtoFactory.ts`、`constructors/MeasuringDeviceViewFactory.ts`、`services/DeviceLifecycleService.ts`、`repositories/rowMappers.ts`。
- PlanStatus: constants/PlanStatus、types/PlanStatus、constructors、logTemplates、errorMessages、筛选器、展示组件/控制器均有引用。
  - 新增引用：`constants/PlanStatus.ts` 内 `IN_PROGRESS_PLAN_STATUS`（报废冲突判定）、`repositories/CalibrationPlanRepository.ts`（事务内 `countInProgressByDeviceId`）、`services/DeviceLifecycleService.ts`、`constructors/CalibrationPlanRowBuilder.ts`、`seed.ts`。
- CertificateResult: constants/CertificateResult、types/CertificateResult、constructors、logTemplates、errorMessages、筛选器、展示组件/控制器均有引用。
- DeviceLifecycleStatus（新增）：
  - 常量：`constants/DeviceLifecycleStatus.ts`（含终态集合 `TERMINAL_DEVICE_LIFECYCLE_STATUS`）
  - 动作枚举：`constants/DeviceLifecycleAction.ts`（`EXEMPT/EXPIRE_RESTORE/SCRAP`）
  - 类型：`models/MeasuringDevice.ts`、`models/DeviceLifecycleRecord.ts`、`types/MeasuringDeviceView.ts`
  - 构造器：`constructors/MeasuringDeviceViewFactory.ts`、`constructors/MeasuringDeviceDtoFactory.ts`
  - 日志模板：`constants/logTemplates.ts` 的 `DeviceLifecycle` 段
  - 错误码/消息：`constants/errorCodes.ts`、`constants/errorMessages.ts`（含 `PERSISTENCE_FAILED`、`DEVICE_CODE_DUPLICATED`、`IDEMPOTENCY_REPLAY_PENDING`）
  - 校验器/格式化：`validators/deviceLifecycleValidator.ts`、`utils/formatters.ts`
  - 服务/控制器/路由：`services/DeviceLifecycleService.ts`、`controllers/DeviceLifecycleController.ts`、`routes/DeviceLifecycleRoutes.ts`
  - 持久化与 DDL：`repositories/db.ts`（连接池/事务）、`repositories/schema.ts`（建表+幂等种子）、`repositories/rowMappers.ts`、`repositories/MeasuringDeviceRepository.ts`、`repositories/DeviceLifecycleRecordRepository.ts`、`repositories/IdempotencyRepository.ts`、`utils/idempotentRun.ts`、`database/init.sql`（`device_lifecycle_record` / `idempotency_record` 表 + `measuring_device` 生命周期列）、`seed.ts`

## 为什么会牵一发动全身

实体字段、枚举、日志模板、错误消息、构造器、筛选器和展示组件被刻意拆散到多个目录；修改一个状态值通常需要同步类型、构造器、服务、控制器、store、页面、README 与数据库种子。

## License

MIT
