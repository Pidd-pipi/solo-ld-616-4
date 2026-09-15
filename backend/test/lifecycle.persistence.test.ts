import { describe, test, before, after } from "node:test";
import assert from "node:assert/strict";
import type EmbeddedPostgres from "embedded-postgres";
import type { ServerHandle } from "./helpers/server";
import { startBackend } from "./helpers/server";
import { startPgCluster, BACKEND_URL } from "./helpers/config";
import { api, waitForReady, waitForHealthDown, stageAssert } from "./helpers/http";
import { openDb, openClient, one, count, rows, runId, sleep } from "./helpers/db";

/**
 * 设备生命周期持久化与幂等集成测试。
 *
 * 全程使用真实数据存储（嵌入式 PostgreSQL 15 = 真实 postgres 进程 + 持久数据目录）
 * 与真实后端子进程（构建产物 dist/main.js）：
 * - 不用 mock / 内存替身；应用经 TCP 连接池访问，测试用独立连接做数据库可回读断言；
 * - 不用单连接串行化绕开持久化、行锁与接管；并发用例经 Promise.all 打多条真实连接，
 *   存活持有者用另一个连接 BEGIN ... FOR UPDATE 真持行锁；
 * - 断库用例真的停掉/重启 postgres 进程。
 *
 * 每个断言都带“阶段名”，失败信息包含当时数据库可回读内容，可定位发生阶段与后果。
 */

const SCRAP_SCOPE = "POST:/api/measuring-device/:id/scrap";
const EXEMPT_SCOPE = "POST:/api/measuring-device/:id/exempt";
const CREATE_SCOPE = "POST:/api/measuring-device/";
const FUTURE = "2030-12-31T00:00:00.000Z";

const idemRow = (client: ReturnType<typeof openDb>, scope: string, key: string) =>
  one(
    client,
    `SELECT scope, idempotency_key, status_code, owner_token, leased_at, completed_at, response
       FROM idempotency_record WHERE scope=$1 AND idempotency_key=$2`,
    [scope, key]
  );

describe("设备生命周期：持久化、故障恢复与幂等接管（真实 PostgreSQL + 真实子进程）", () => {
  let pg: EmbeddedPostgres;
  let server: ServerHandle;
  const db = openDb();
  const RUN = runId();

  const newDevice = async (code: string): Promise<number> => {
    const res = await api.post("/api/measuring-device/", { device_code: code, name: code });
    assert.equal(res.status, 201, `[准备] 新建设备 ${code} 应 201，实际 ${res.status} ${JSON.stringify(res.body)}`);
    return (res.body as { id: number }).id;
  };

  const stopPg = async () => {
    await pg.stop();
  };
  const startPg = async () => {
    // 复用同一持久数据目录重新拉起真实 postgres 进程（模拟数据库重启，非重建）。
    pg = await startPgCluster(false);
  };

  before(async () => {
    pg = await startPgCluster(true); // 每轮全新数据目录，保证连续运行稳定
    server = await startBackend();
    await waitForReady(BACKEND_URL, 30000);
  });

  after(async () => {
    await db.end().catch(() => undefined);
    await server.stop().catch(() => undefined);
    await pg.stop().catch(() => undefined);
  });

  // ---------------------------------------------------------------------------
  test("基线：种子数据与生命周期视图可回读", async () => {
    const stage = "基线";
    const devices = await count(db, "SELECT count(*)::int n FROM measuring_device");
    const plans = await count(db, "SELECT count(*)::int n FROM calibration_plan");
    const certs = await count(db, "SELECT count(*)::int n FROM calibration_certificate");
    const alerts = await count(db, "SELECT count(*)::int n FROM overdue_alert");
    stageAssert(stage, devices === 3, `种子设备应为 3，回读 ${devices}`);
    stageAssert(stage, plans === 3 && certs === 3 && alerts === 3, `种子计划/证书/预警应均为 3，回读 ${plans}/${certs}/${alerts}`);

    const list = await api.get("/api/measuring-device/");
    stageAssert(stage, list.status === 200, "台账查询 200");
    const rows = list.body as Array<Record<string, unknown>>;
    stageAssert(
      stage,
      rows.every((r) => "lifecycle_status" in r && "status" in r && "last_lifecycle_change" in r),
      "每行同时返回生命周期/校准状态/最近变更",
      rows[0]
    );
  });

  // ---------------------------------------------------------------------------
  test("同接口同键 · 串行重放：两次豁免同结果，业务与变更记录仅一条", async () => {
    const stage = "串行重放";
    const deviceId = await newDevice(`SER-${RUN}`);
    const key = `ser-${RUN}`;
    const payload = { reason: "串行封存", exempt_until: FUTURE };

    const a = await api.post(`/api/measuring-device/${deviceId}/exempt`, payload, { key });
    const b = await api.post(`/api/measuring-device/${deviceId}/exempt`, payload, { key });
    stageAssert(stage, a.status === 200 && b.status === 200, `两次豁免都应 200，实际 ${a.status}/${b.status}`);
    // 回读结果与首次响应语义一致（JSONB 会归一化键序，故逐字段深比较而非字符串比较）。
    assert.deepStrictEqual(b.body, a.body);

    const nExempt = await count(
      db,
      "SELECT count(*)::int n FROM device_lifecycle_record WHERE device_id=$1 AND action='EXEMPT'",
      [deviceId]
    );
    stageAssert(stage, nExempt === 1, `EXEMPT 记录应仅 1 条，回读 ${nExempt}`);
    const row = await idemRow(db, EXEMPT_SCOPE, key);
    stageAssert(stage, Number(row.status_code) === 200 && row.completed_at !== null, "幂等行已完成且可回读", row);
  });

  // ---------------------------------------------------------------------------
  test("同接口同键 · 并发重放：8 个真实连接并发只执行一次，其余重放", async () => {
    const stage = "并发重放";
    const code = `CC-${RUN}`;
    const key = `cc-${RUN}`;
    const payload = { device_code: code, name: "并发建档" };

    const results = await Promise.all(
      Array.from({ length: 8 }, () => api.post("/api/measuring-device/", payload, { key, timeoutMs: 20000 }))
    );
    const statuses = results.map((r) => r.status).sort((x, y) => x - y);
    const bodies = results.map((r) => r.body as { id: number });
    const ids = new Set(bodies.map((b) => b.id));

    stageAssert(
      stage,
      results.every((r) => r.status === 200 || r.status === 201),
      `并发请求不应出现 4xx/5xx，状态分布 ${JSON.stringify(statuses)}`,
      results.map((r) => ({ s: r.status, c: (r.body as any)?.code }))
    );
    const created = results.filter((r) => r.status === 201).length;
    // 回放首次结果时也返回首次的 201，因此不能用 201 个数判断执行次数；
    // “只执行一次”由数据库副作用唯一（设备 1 台、幂等行 1 条）权威保证。
    stageAssert(
      stage,
      results.every((r) => r.status === 201),
      `并发请求都应得到成功状态（执行或重放首次 201），实际 ${JSON.stringify(statuses)}`,
      results.map((r) => ({ s: r.status, c: (r.body as any)?.code }))
    );
    void created;
    stageAssert(stage, ids.size === 1, `所有响应应回读同一设备 id，实际 ${[...ids].join(",")}`);

    const nDevice = await count(db, "SELECT count(*)::int n FROM measuring_device WHERE device_code=$1", [code]);
    stageAssert(stage, nDevice === 1, `数据库中该编码设备应仅 1 台，回读 ${nDevice}`);
    const nRows = await count(
      db,
      "SELECT count(*)::int n FROM idempotency_record WHERE scope=$1 AND idempotency_key=$2",
      [CREATE_SCOPE, key]
    );
    stageAssert(stage, nRows === 1, `幂等行应仅 1 条，回读 ${nRows}`);
  });

  // ---------------------------------------------------------------------------
  test("失联占位接管：status_code=0 且租约过期后被安全接管，仅执行一次", async () => {
    const stage = "失联接管";
    const deviceId = await newDevice(`TK-${RUN}`);
    const key = `tk-${RUN}`;
    // 模拟持有者在“占位写入后、业务提交前”崩溃：未完成占位 + 过期租约。
    await db.query(
      `INSERT INTO idempotency_record (scope,idempotency_key,status_code,response,owner_token,leased_at,created_at)
       VALUES ($1,$2,0,'null'::jsonb,$3, now() - interval '1 hour', now() - interval '1 hour')`,
      [SCRAP_SCOPE, key, "dead-owner-token"]
    );

    const res = await api.post(`/api/measuring-device/${deviceId}/scrap`, { reason: "接管后报废" }, { key });
    stageAssert(stage, res.status === 200, `接管后报废应 200，实际 ${res.status} ${JSON.stringify(res.body)}`);
    stageAssert(
      stage,
      (res.body as any).lifecycle_status === "SCRAPPED",
      "回读响应应为 SCRAPPED",
      res.body
    );

    const nScrap = await count(
      db,
      "SELECT count(*)::int n FROM device_lifecycle_record WHERE device_id=$1 AND action='SCRAP'",
      [deviceId]
    );
    stageAssert(stage, nScrap === 1, `接管后 SCRAP 记录应仅 1 条，回读 ${nScrap}`);

    // 再次同键：重放接管者首次结果，不二次执行。
    const replay = await api.post(`/api/measuring-device/${deviceId}/scrap`, { reason: "接管后报废" }, { key });
    stageAssert(stage, replay.status === 200, "接管完成后同键重放 200");
    const nScrap2 = await count(
      db,
      "SELECT count(*)::int n FROM device_lifecycle_record WHERE device_id=$1 AND action='SCRAP'",
      [deviceId]
    );
    stageAssert(stage, nScrap2 === 1, `重放后 SCRAP 仍仅 1 条，回读 ${nScrap2}`);
    const row = await idemRow(db, SCRAP_SCOPE, key);
    stageAssert(
      stage,
      Number(row.status_code) === 200 && row.completed_at !== null && row.owner_token !== "dead-owner-token",
      "占位归属已切换给接管者且结果已登记",
      { status_code: row.status_code, owner_token: row.owner_token, completed_at: row.completed_at }
    );
  });

  // ---------------------------------------------------------------------------
  test("存活持有者持行锁期间不接管：跟随者等待后得到可重试 409，零业务写入", async () => {
    const stage = "存活持有者";
    const deviceId = await newDevice(`LOCK-${RUN}`);
    const key = `lock-${RUN}`;
    await db.query(
      `INSERT INTO idempotency_record (scope,idempotency_key,status_code,response,owner_token,leased_at,created_at)
       VALUES ($1,$2,0,'null'::jsonb,$3, now(), now())`,
      [EXEMPT_SCOPE, key, "live-owner-token"]
    );

    // 用一条独立连接真实持有该占位行锁（模拟持有者正处在业务事务中）。
    const locker = openClient();
    await locker.connect();
    try {
      await locker.query("BEGIN");
      await locker.query(
        "SELECT 1 FROM idempotency_record WHERE scope=$1 AND idempotency_key=$2 FOR UPDATE",
        [EXEMPT_SCOPE, key]
      );

      const started = Date.now();
      const res = await api.post(
        `/api/measuring-device/${deviceId}/exempt`,
        { reason: "不应被接管", exempt_until: FUTURE },
        { key, timeoutMs: 10000 }
      );
      const elapsed = Date.now() - started;
      stageAssert(
        stage,
        res.status === 409 && (res.body as any).code === "IDEMPOTENCY_REPLAY_PENDING",
        `存活持有者期间应等待后返回可重试 409，实际 ${res.status} ${JSON.stringify(res.body)}`,
        { elapsedMs: elapsed }
      );
      const nExempt = await count(
        db,
        "SELECT count(*)::int n FROM device_lifecycle_record WHERE device_id=$1 AND action='EXEMPT'",
        [deviceId]
      );
      stageAssert(stage, nExempt === 0, `持锁期间不应发生业务写入，回读 EXEMPT=${nExempt}`);

      await locker.query("ROLLBACK");
    } finally {
      await locker.end().catch(() => undefined);
    }

    // 持有者释放后，占位租约很快过期；同键请求接管并完成。
    await sleep(900);
    const res2 = await api.post(
      `/api/measuring-device/${deviceId}/exempt`,
      { reason: "释放后接管", exempt_until: FUTURE },
      { key, timeoutMs: 10000 }
    );
    stageAssert(stage, res2.status === 200, `锁释放且租约过期后应接管成功，实际 ${res2.status} ${JSON.stringify(res2.body)}`);
    const nExempt2 = await count(
      db,
      "SELECT count(*)::int n FROM device_lifecycle_record WHERE device_id=$1 AND action='EXEMPT'",
      [deviceId]
    );
    stageAssert(stage, nExempt2 === 1, `接管成功后 EXEMPT 仅 1 条，回读 ${nExempt2}`);
  });

  // ---------------------------------------------------------------------------
  test("业务失败回收：报废冲突 409 删除未完成占位，同键改目标重试到唯一成功", async () => {
    const stage = "失败回收";
    const key = `reclaim-${RUN}`;
    // 种子 device 2 存在 IN_PROGRESS 计划 -> 报废冲突。
    const conflict = await api.post("/api/measuring-device/2/scrap", {}, { key });
    stageAssert(
      stage,
      conflict.status === 409 && (conflict.body as any).code === "DEVICE_SCRAP_PLAN_CONFLICT",
      `有进行中计划应报废冲突 409，实际 ${conflict.status} ${JSON.stringify(conflict.body)}`
    );
    const pending = await count(
      db,
      "SELECT count(*)::int n FROM idempotency_record WHERE scope=$1 AND idempotency_key=$2",
      [SCRAP_SCOPE, key]
    );
    stageAssert(stage, pending === 0, `业务失败后未完成占位应被回收，回读 ${pending}`);
    const device2 = await one<{ lifecycle_status: string }>(
      db,
      "SELECT lifecycle_status FROM measuring_device WHERE id=2"
    );
    stageAssert(stage, device2.lifecycle_status === "ACTIVE", "冲突设备应保持原状态 ACTIVE", device2);

    // 同键换一个无计划的新设备重试：应成功且仅一条 SCRAP。
    const targetId = await newDevice(`RC-${RUN}`);
    const ok = await api.post(`/api/measuring-device/${targetId}/scrap`, {}, { key });
    stageAssert(stage, ok.status === 200, `同键修正目标后应成功，实际 ${ok.status} ${JSON.stringify(ok.body)}`);
    const nScrap = await count(
      db,
      "SELECT count(*)::int n FROM device_lifecycle_record WHERE device_id=$1 AND action='SCRAP'",
      [targetId]
    );
    stageAssert(stage, nScrap === 1, `重试成功设备 SCRAP 仅 1 条，回读 ${nScrap}`);
    const row = await idemRow(db, SCRAP_SCOPE, key);
    stageAssert(stage, Number(row.status_code) === 200, "同键重试后占位登记为 200", row.status_code);
  });

  // ---------------------------------------------------------------------------
  test("跨接口同键隔离：建档/豁免/报废复用同一键互不串用", async () => {
    const stage = "跨接口隔离";
    const key = `shared-${RUN}`;
    const createCode = `ISO-C-${RUN}`;
    const exemptId = await newDevice(`ISO-E-${RUN}`);
    const scrapId = await newDevice(`ISO-S-${RUN}`);

    const c = await api.post("/api/measuring-device/", { device_code: createCode, name: "建档" }, { key });
    const e = await api.post(`/api/measuring-device/${exemptId}/exempt`, { reason: "隔离豁免", exempt_until: FUTURE }, { key });
    const s = await api.post(`/api/measuring-device/${scrapId}/scrap`, { reason: "隔离报废" }, { key });

    stageAssert(stage, c.status === 201 && (c.body as any).device_code === createCode, "建档返回建档结果", c.body);
    stageAssert(
      stage,
      e.status === 200 && (e.body as any).lifecycle_status === "EXEMPT" && (e.body as any).id === exemptId,
      "豁免返回该设备的豁免结果，未串用建档响应",
      e.body
    );
    stageAssert(
      stage,
      s.status === 200 && (s.body as any).lifecycle_status === "SCRAPPED" && (s.body as any).id === scrapId,
      "报废返回该设备的报废结果，未串用其它响应",
      s.body
    );

    const nRows = await count(
      db,
      "SELECT count(*)::int n FROM idempotency_record WHERE idempotency_key=$1",
      [key]
    );
    stageAssert(stage, nRows === 3, `同一键应在 3 个 scope 各占一行，回读 ${nRows}`);
    const scopes = (
      await rows<{ scope: string }>(
        db,
        "SELECT scope FROM idempotency_record WHERE idempotency_key=$1 ORDER BY scope",
        [key]
      )
    ).map((r) => r.scope);
    const expected = [CREATE_SCOPE, EXEMPT_SCOPE, SCRAP_SCOPE].sort();
    assert.deepStrictEqual(scopes, expected);
    stageAssert(stage, scopes.length === 3, `同一键应在 3 个 scope 各占一行，回读 ${scopes.length}`, scopes);
    const nCreated = await count(db, "SELECT count(*)::int n FROM measuring_device WHERE device_code=$1", [createCode]);
    const nExempt = await count(db, "SELECT count(*)::int n FROM device_lifecycle_record WHERE device_id=$1 AND action='EXEMPT'", [exemptId]);
    const nScrap = await count(db, "SELECT count(*)::int n FROM device_lifecycle_record WHERE device_id=$1 AND action='SCRAP'", [scrapId]);
    stageAssert(stage, nCreated === 1 && nExempt === 1 && nScrap === 1, "三类副作用各恰好一次", { nCreated, nExempt, nScrap });
  });

  // ---------------------------------------------------------------------------
  test("断库：进程存活、读写返回可重试 503；恢复后自动就绪且数据不变", async () => {
    const stage = "断库恢复";
    const devicesBefore = await count(db, "SELECT count(*)::int n FROM measuring_device");
    const pid = server.process.pid;
    stageAssert(stage, typeof pid === "number" && server.process.exitCode === null, "断库前后端进程存活", { pid });

    let stopped = false;
    try {
      await stopPg();
      stopped = true;
      // 等就绪探测观察到掉线（不能只 sleep 固定时间，避免时序抖动导致 200/503 误判）。
      const downStatus = await waitForHealthDown(BACKEND_URL, 8000);

      // 进程不退出
      stageAssert(
        stage,
        server.process.exitCode === null,
        `断库后进程必须存活，实际 exitCode=${server.process.exitCode}`,
        { pid }
      );

      const health = await api.get("/health", { timeoutMs: 5000 });
      stageAssert(stage, health.status === 503, `/health 断库期应 503（探测到 ${downStatus}），实际 ${health.status}`, health.body);
      stageAssert(
        stage,
        (health.body as any).database === "down",
        "health.database 应标记 down",
        health.body
      );

      const list = await api.get("/api/measuring-device/", { timeoutMs: 5000 });
      const create = await api.post(
        "/api/measuring-device/",
        { device_code: `OUTAGE-${RUN}`, name: "断库期间" },
        { timeoutMs: 5000 }
      );
      for (const [name, r] of [["读", list], ["写", create]] as const) {
        stageAssert(stage, r.status === 503, `${name} 请求断库期应 503，实际 ${r.status}`, r.body);
        stageAssert(
          stage,
          (r.body as any).retryable === true,
          `${name} 失败应标记 retryable=true`,
          r.body
        );
        stageAssert(stage, r.headers["retry-after"] !== undefined, `${name} 响应应带 Retry-After`, Object.keys(r.headers));
      }
    } finally {
      // 无论断言是否失败都必须恢复数据库，否则后续用例因无库而级联失败。
      if (stopped) {
        await startPg();
        stopped = false;
      }
      await waitForReady(BACKEND_URL, 30000);
    }

    const devicesAfter = await count(db, "SELECT count(*)::int n FROM measuring_device");
    stageAssert(stage, devicesAfter === devicesBefore, `恢复后设备数应不变 ${devicesBefore}，回读 ${devicesAfter}`);
    const leaked = await count(db, "SELECT count(*)::int n FROM measuring_device WHERE device_code=$1", [`OUTAGE-${RUN}`]);
    stageAssert(stage, leaked === 0, "断库期间的失败写入不得落库", { leaked });

    const ok = await api.post("/api/measuring-device/", { device_code: `BACK-${RUN}`, name: "恢复后" });
    stageAssert(stage, ok.status === 201, `恢复后写入应 201，实际 ${ok.status}`, ok.body);
    const devicesFinal = await count(db, "SELECT count(*)::int n FROM measuring_device");
    stageAssert(stage, devicesFinal === devicesBefore + 1, "恢复后写入真实落库（数量 +1）", { devicesBefore, devicesFinal });
    stageAssert(stage, server.process.exitCode === null, "整个断库/恢复周期后端是同一个存活进程", { pid });
  });

  // ---------------------------------------------------------------------------
  test("进程重启持久化：重启后端后豁免/报废/新设备与变更记录可回读，数量不变", async () => {
    const stage = "进程重启";
    const beforeCounts = {
      device: await count(db, "SELECT count(*)::int n FROM measuring_device"),
      plan: await count(db, "SELECT count(*)::int n FROM calibration_plan"),
      cert: await count(db, "SELECT count(*)::int n FROM calibration_certificate"),
      alert: await count(db, "SELECT count(*)::int n FROM overdue_alert")
    };
    const exemptId = await newDevice(`PERSIST-E-${RUN}`);
    await api.post(`/api/measuring-device/${exemptId}/exempt`, { reason: "重启前豁免", exempt_until: FUTURE });
    const newCode = `PERSIST-D-${RUN}`;
    await api.post("/api/measuring-device/", { device_code: newCode, name: "重启前建档" });

    // 重启应用进程（数据库保持运行）。
    await server.stop();
    server = await startBackend();
    await waitForReady(BACKEND_URL, 30000);

    const view = await api.get("/api/measuring-device/");
    const rows = view.body as Array<Record<string, any>>;
    const ex = rows.find((r) => r.id === exemptId);
    stageAssert(
      stage,
      ex?.lifecycle_status === "EXEMPT" &&
        ex?.exempt_reason === "重启前豁免" &&
        ex?.last_lifecycle_change?.action === "EXEMPT",
      "重启后豁免状态/原因/最近变更可回读",
      ex
    );
    const created = rows.find((r) => r.device_code === newCode);
    stageAssert(stage, !!created && created.lifecycle_status === "ACTIVE", "重启后新建设备可回读", created);

    const afterCounts = {
      device: await count(db, "SELECT count(*)::int n FROM measuring_device"),
      plan: await count(db, "SELECT count(*)::int n FROM calibration_plan"),
      cert: await count(db, "SELECT count(*)::int n FROM calibration_certificate"),
      alert: await count(db, "SELECT count(*)::int n FROM overdue_alert")
    };
    stageAssert(
      stage,
      afterCounts.plan === beforeCounts.plan &&
        afterCounts.cert === beforeCounts.cert &&
        afterCounts.alert === beforeCounts.alert,
      "重启不改变计划/证书/预警数量",
      { before: beforeCounts, after: afterCounts }
    );
    stageAssert(stage, afterCounts.device === beforeCounts.device + 2, "重启后设备数等于重启前写入（+2）", {
      before: beforeCounts.device,
      after: afterCounts.device
    });
  });
});
