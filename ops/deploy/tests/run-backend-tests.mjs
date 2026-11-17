// Provision exclusively owned synthetic test datastores; never use backend/.env.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { setTimeout as pause } from "node:timers/promises";
const root = fileURLToPath(new URL("../../../", import.meta.url));
const id = `ambusync-mailbox-tests-${process.pid}-${Date.now()}`;
const database = `ambusync_l_mailbox_${process.pid}`;
const owned = [];
function docker(args) {
  const r = spawnSync("docker", args, { encoding: "utf8", timeout: 120000, stdio: ["pipe", "pipe", "pipe"] });
  if (r.status !== 0) throw Error(`Test datastore operation failed: ${args[0]}`);
  return r.stdout.trim();
}
try {
  for (const [name, image, port, extra] of [
    ["pg", "postgres:17-bookworm@sha256:40865bc877a289da75963d97d72b59633f639fc5af7a4e856bfa3714cae5b536", 5432, ["-e", "POSTGRES_USER=synthetic", "-e", "POSTGRES_PASSWORD=synthetic", "-e", `POSTGRES_DB=${database}`]],
    ["kv", "valkey/valkey:8-alpine@sha256:2602ace2be6569bc2bbb06f873776516ab9089821525be34f4305c67eb9db02a", 6379, []],
  ]) {
    docker(["run", "-d", "--name", `${id}-${name}`, "--label", `ambusync.test=${id}`, "-p", `127.0.0.1::${port}`, ...extra, image]);
    owned.push(`${id}-${name}`);
  }
  const until = Date.now() + 30000;
  while (true) {
    const r = spawnSync("docker", ["exec", `${id}-pg`, "pg_isready", "-U", "synthetic"], { stdio: "pipe" });
    if (r.status === 0) break;
    if (Date.now() > until) throw Error("Synthetic PostgreSQL readiness deadline");
    await pause(200);
  }
  const pg = docker(["port", `${id}-pg`, "5432/tcp"]).split(":").at(-1);
  const kv = docker(["port", `${id}-kv`, "6379/tcp"]).split(":").at(-1);
  const env = { ...process.env, AMBUSYNC_LOAD_DOTENV: "false",
    DJANGO_SETTINGS_MODULE: "config.settings", DJANGO_SECRET_KEY: "synthetic-test-secret-not-used-for-real-sessions-".repeat(2),
    DATABASE_URL: `postgresql://synthetic:synthetic@127.0.0.1:${pg}/${database}?connect_timeout=3`,
    VALKEY_URL: `redis://127.0.0.1:${kv}/0`, FRONTEND_BASE_URL: "http://localhost:5173",
  };
  for (const key of Object.keys(env)) if (key.toUpperCase().startsWith("PG")) delete env[key];
  const r = spawnSync("uv", ["run", "--directory", "backend", "python", "manage.py", "test",
    ...process.argv.slice(2), "--noinput"], { cwd: root, env, stdio: "inherit", timeout: 600000 });
  process.exitCode = r.status ?? 1;
} finally {
  for (const name of owned.reverse()) {
    if (docker(["inspect", "--format", '{{index .Config.Labels "ambusync.test"}}', name]) !== id) throw Error("Cleanup ownership guard");
    docker(["rm", "-f", "-v", name]);
  }
}
