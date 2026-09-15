import assert from "node:assert/strict";

/** 测试 HTTP 响应：状态码、解析后的 JSON、响应头（用于校验 Retry-After）。 */
export interface ApiResponse<T = any> {
  status: number;
  body: T;
  headers: Record<string, string>;
}

const request = async <T = any>(
  method: string,
  urlPath: string,
  opts: {
    body?: unknown;
    key?: string;
    timeoutMs?: number;
    base?: string;
  } = {}
): Promise<ApiResponse<T>> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 15000);
  try {
    const headers: Record<string, string> = {};
    let payload: string | undefined;
    if (opts.body !== undefined) {
      payload = JSON.stringify(opts.body);
      headers["content-type"] = "application/json";
      headers["content-length"] = String(Buffer.byteLength(payload));
    }
    if (opts.key) {
      headers["Idempotency-Key"] = opts.key;
    }
    const res = await fetch(`${opts.base ?? "http://127.0.0.1:21199"}${urlPath}`, {
      method,
      headers,
      body: payload,
      signal: controller.signal
    });
    const text = await res.text();
    const headerObj: Record<string, string> = {};
    res.headers.forEach((value, name) => {
      headerObj[name.toLowerCase()] = value;
    });
    let parsed: any = text;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      // 非 JSON（如空响应）保留原文
    }
    return { status: res.status, body: parsed, headers: headerObj };
  } finally {
    clearTimeout(timer);
  }
};

export const api = {
  get: (p: string, opts?: { timeoutMs?: number }) => request("GET", p, opts),
  post: (p: string, body?: unknown, opts?: { key?: string; timeoutMs?: number }) =>
    request("POST", p, { body, ...opts })
};

/** 等待 /health 返回 200（数据库就绪）。 */
export const waitForReady = async (
  base = "http://127.0.0.1:21199",
  timeoutMs = 30000
): Promise<void> => {
  const deadline = Date.now() + timeoutMs;
  let last: unknown;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${base}/health`);
      last = res.status;
      if (res.status === 200) {
        return;
      }
    } catch (err) {
      last = (err as Error).message;
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`backend did not become ready; last health status: ${String(last)}`);
};

/** 等待 /health 返回非 200（数据库被停掉后，就绪探测观察到掉线）。 */
export const waitForHealthDown = async (
  base = "http://127.0.0.1:21199",
  timeoutMs = 10000
): Promise<number> => {
  const deadline = Date.now() + timeoutMs;
  let last = 200;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${base}/health`);
      last = res.status;
      if (res.status !== 200) {
        return res.status;
      }
    } catch {
      // 连接被拒也算不可用（极端情况下后端自身未监听，但本场景后端始终存活）
      return 0;
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`health stayed 200 after database shutdown; last=${last}`);
};
export const stageAssert = (
  stage: string,
  condition: unknown,
  message: string,
  dbSnapshot?: unknown
): void => {
  if (!condition) {
    const detail = dbSnapshot === undefined ? "" : ` | DB回读=${JSON.stringify(dbSnapshot)}`;
    assert.fail(`[${stage}] ${message}${detail}`);
  }
};
