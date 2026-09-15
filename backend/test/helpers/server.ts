import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { BACKEND_PORT, BACKEND_LOG, SERVER_ENV } from "./config";

/**
 * 以真实子进程运行构建产物 dist/main.js（生产启动入口），
 * 这样断库、崩溃接管、重启持久化都作用于真实进程生命周期，而非函数内调用。
 */
export interface ServerHandle {
  process: ChildProcess;
  stop: () => Promise<void>;
}

export const waitForExit = (child: ChildProcess, timeoutMs = 8000): Promise<number> =>
  new Promise((resolve, reject) => {
    if (child.exitCode !== null) {
      resolve(child.exitCode ?? 0);
      return;
    }
    const timer = setTimeout(() => reject(new Error("process did not exit in time")), timeoutMs);
    child.once("exit", (code) => {
      clearTimeout(timer);
      resolve(code ?? 0);
    });
  });

const waitForPortFree = async (host: string, port: number, timeoutMs = 5000): Promise<void> => {
  const net = await import("node:net");
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const free = await new Promise<boolean>((resolve) => {
      const srv = net.createServer();
      srv.once("error", () => resolve(false));
      srv.listen(port, host, () => srv.close(() => resolve(true)));
    });
    if (free) {
      return;
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`port ${port} still in use after ${timeoutMs}ms`);
};

export const startBackend = async (distDir = path.resolve(__dirname, "..", "..", "dist")): Promise<ServerHandle> => {
  fs.mkdirSync(path.dirname(BACKEND_LOG), { recursive: true });
  const out = fs.openSync(BACKEND_LOG, "a");
  const child = spawn("node", [path.join(distDir, "main.js")], {
    env: { ...process.env, ...SERVER_ENV },
    stdio: ["ignore", out, out],
    detached: false
  });

  child.on("error", (err) => {
    console.error("[test] backend process error:", err);
  });

  // 等端口释放（保证 stop 后可立即重启复用端口）。
  await waitForPortFree("127.0.0.1", BACKEND_PORT, 200).catch(() => undefined);

  return {
    process: child,
    stop: async () => {
      if (child.exitCode === null) {
        child.kill("SIGTERM");
        await waitForExit(child).catch(() => undefined);
      }
      fs.closeSync(out);
      await waitForPortFree("127.0.0.1", BACKEND_PORT, 5000);
    }
  };
};
