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
- `DB_CONNECT_RETRY_DELAY_MS`: 数据库未就绪/掉线后的后台重试间隔，默认 1000ms（无限重试，进程不退出）
- `DB_READY_PROBE_INTERVAL_MS`: 就绪后的数据库探活间隔，默认 3000ms；探测到掉线即返回可重试 503，恢复后自动转回正常服务

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

冲突相关错误码：`DEVICE_NOT_FOUND`(404)、`DEVICE_ALREADY_SCRAPPED`(409)、`DEVICE_ALREADY_EXEMPT`(409)、`DEVICE_SCRAP_PLAN_CONFLICT`(409)、`PLAN_DEVICE_SCRAPPED`(409)、`PLAN_DEVICE_EXEMPT`(409)、`DEVICE_CODE_DUPLICATED`(409)、`IDEMPOTENCY_REPLAY_PENDING`(409)、`PERSISTENCE_FAILED`(503)、`DATABASE_NOT_READY`(503, retryable)、`VALIDATION_FAILED`(400)。

## 持久化与故障恢复

- 所有写入（建档、豁免、到期恢复、报废、新建计划/证书/预警）都直接落 **PostgreSQL**，进程内不保留业务可变状态；服务重启后豁免、报废、新增设备和变更记录仍可查到，计划、证书、预警数量不随重启变化。
- **进程不依赖数据库先启动**：HTTP 服务先监听，建表与幂等种子（`repositories/schema.ts`，与 `database/init.sql` 对齐；`ON CONFLICT DO NOTHING` + 校正 identity 序列）在后台无限重试。数据库暂时不可用时进程**保持存活**，所有 `/api` 读写返回可重试的 `503`（`code=DATABASE_NOT_READY`/`PERSISTENCE_FAILED`、`retryable:true`、响应头 `Retry-After: 2`），`/health` 返回 503 且 `database=initializing|down`；数据库恢复后连接池自动重连、引导补建表/种子且**不覆盖已有数据**，接口自动恢复，无需重启后端。
- 生命周期写操作在事务内对设备行 `SELECT ... FOR UPDATE`：状态判定、进行中计划计数、设备更新、变更记录追加原子提交；连接中断等可重试故障整体回滚并返回 503，不会出现“只改内存后报告成功”。
- **写接口幂等（按调用范围隔离 + 崩溃接管）**：对建档、豁免、报废、新建计划/证书/预警在请求头带 `Idempotency-Key: <任意唯一串>`。重放结果以 `(scope, key)` 存储，`scope` 自动取「HTTP 方法 + 路由模式」（如 `POST:/api/measuring-device/:id/exempt`）：
  - 同一接口重复或并发提交相同 key：只落一次库，其余返回首次结果，不会生成两条相同记录；
  - **不同写接口即使 key 相同也互不串用**（设备建档不会重放到豁免接口）；
  - **业务写入与结果登记在持有者同一事务提交/回滚**，不存在“业务已提交但结果未登记”的中间态：崩溃在提交前则业务整体回滚、无副作用，崩溃在提交时二者同生共灭；
  - **持有者失联可安全接管**：占位带 `owner_token` 与 `leased_at` 租约，执行期间持有者对占位行加 `FOR UPDATE` 行锁，跟随者用 `FOR UPDATE SKIP LOCKED` 非阻塞探测——持有者存活时只等待（最终返回可重试 `409 IDEMPOTENCY_REPLAY_PENDING`），持有者崩溃致行锁释放且租约过期后，跟随者原子接管并重跑到唯一结果，绝不执行两次；跟随者也可能在同一次请求内完成接管；
  - 业务校验失败（如报废冲突 409）时事务回滚并释放未完成占位，同一 key 修正后可立即重试到唯一结果；不带该头则按普通请求处理；`device_code` 上还有数据库唯一约束兜底重复建档。
  - 相关参数：`IDEMPOTENCY_LEASE_TTL_MS`（默认 15000，仅覆盖“抢到占位到业务事务拿到行锁”的毫秒级间隙，执行期间由行锁守护）、`IDEMPOTENCY_WAIT_TIMEOUT_MS`（默认 30000）、`IDEMPOTENCY_POLL_INTERVAL_MS`（默认 200）。
- 升级旧版 `idempotency_record`（单列主键版、或无租约列的复合主键版）时，引导会执行一次性在线迁移：改为 `(scope, idempotency_key)` 复合主键并补齐 `owner_token/leased_at/completed_at`，历史未完成占位启动即回收。

```bash
# 同一豁免重复提交两次，只产生一条 EXEMPT 记录
for i in 1 2; do
  curl -s -o /dev/null -w '%{http_code}\n' -X POST \
    http://localhost:21116/api/measuring-device/1/exempt \
    -H 'content-type: application/json' -H 'Idempotency-Key: exempt-dev1-2026q4' \
    -d '{"reason":"封存待处置","exempt_until":"2026-12-31T00:00:00Z"}'
done
# 数据库断线期间：进程仍在，返回可重试 503；恢复后自动继续，数据不变
curl -i http://localhost:21116/api/measuring-device/   # 含 Retry-After: 2 与 retryable:true
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
