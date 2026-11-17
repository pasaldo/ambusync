// Dedicated short-lived Vite process; never reuse or stop the user's servers.
import { createServer } from "node:net";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const cwd = fileURLToPath(new URL("../", import.meta.url));
const listener = createServer();
await new Promise(resolve => listener.listen(0, "127.0.0.1", resolve));
const port = listener.address().port;
await new Promise(resolve => listener.close(resolve));
const base = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", String(port), "--strictPort"],
  { cwd, stdio: ["ignore", "pipe", "pipe"] });
try {
  const until = Date.now() + 20000;
  while (true) {
    try { if ((await fetch(base)).ok) break; } catch {}
    if (Date.now() > until || server.exitCode !== null) throw Error("Isolated Vite did not start");
    await new Promise(r => setTimeout(r, 100));
  }
  const test = spawn(process.execPath, process.argv.slice(2), {
    cwd, env: { ...process.env, BASE_URL: base }, stdio: "inherit",
  });
  process.exitCode = await new Promise(resolve => test.on("exit", code => resolve(code ?? 1)));
} finally {
  if (process.platform === "win32") spawnSync("taskkill", ["/PID", String(server.pid), "/T", "/F"], { stdio: "pipe" });
  else server.kill("SIGTERM");
}
