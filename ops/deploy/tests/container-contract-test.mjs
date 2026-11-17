import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, copyFileSync, writeFileSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync, spawnSync } from "node:child_process";
import { createServer as createHttpsServer, request as httpsRequest } from "node:https";
import { request as httpRequest } from "node:http";
import { createRequire } from "node:module";

const root = fileURLToPath(new URL("../../../", import.meta.url));
assert.ok(existsSync(`${root}/Dockerfile`), "Deployment image recipe is absent");
assert.ok(existsSync(`${root}/backend/config/deployment_start.py`), "Guarded entrypoint is absent");
const require = createRequire(join(root, "frontend/package.json"));
const { chromium } = require("playwright");
const id = `ambusync-l-${process.pid}-${Date.now()}`;
const sha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
assert.match(sha, /^[a-f0-9]{40}$/);
const scratchRoot = process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, "Temp/opencode") : tmpdir();
const scratch = mkdtempSync(join(scratchRoot, "ambusync-l-container-"));
const image = `${id}:test`;
const names = { pg: `${id}-pg`, kv: `${id}-kv`, app: `${id}-app`, probe: `${id}-probe` };
const pgImage = "postgres:17-bookworm@sha256:40865bc877a289da75963d97d72b59633f639fc5af7a4e856bfa3714cae5b536";
const kvImage = "valkey/valkey:8-alpine@sha256:2602ace2be6569bc2bbb06f873776516ab9089821525be34f4305c67eb9db02a";
const marker = "SYNTHETIC-BUILD-SECRET-SHOULD-NEVER-ENTER-IMAGE";
let proxy, browser, networkCreated = false;
const owned = new Set();
function docker(args, timeout = 120000, input) {
  if (args[0] === "logs") {
    const result = spawnSync("docker", args, { cwd: root, timeout, encoding: "utf8" });
    assert.equal(result.status, 0, "Cannot inspect this test's container logs");
    return result.stdout + result.stderr;
  }
  return execFileSync("docker", args, { cwd: root, timeout, encoding: "utf8", input, maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] }).trim();
}
function run(name, args) {
  // Unique names only. Never remove/replace a pre-existing container on conflict.
  const result = docker(["run", "--name", name, "--label", `ambusync.smoke=${id}`, ...args]);
  owned.add(name);
  return result;
}
function remove(name) {
  if (!owned.has(name)) return;
  assert.equal(docker(["inspect", "--format", '{{index .Config.Labels "ambusync.smoke"}}', name]), id);
  docker(["rm", "-f", "-v", name]); owned.delete(name);
}
async function eventually(check, seconds = 50) {
  const deadline = Date.now() + seconds * 1000;
  let last;
  while (Date.now() < deadline) {
    try { return await check(); } catch (error) { last = error; }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  throw last;
}
const env = (origin, approval = sha) => [
  "DJANGO_SECRET_KEY=synthetic-container-secret-".repeat(1) + "x".repeat(60),
  `FRONTEND_BASE_URL=${origin}`, "AMBUSYNC_LOCAL_SMOKE=1", "AMBUSYNC_DATABASE_NETWORK=smoke",
  "DATABASE_URL=postgresql://synthetic:synthetic@ambusync-l-pg/synthetic_l?sslmode=disable",
  "VALKEY_URL=redis://ambusync-l-kv:6379/0",
  "AMBUSYNC_EXPECTED_DATABASE_HOST=ambusync-l-pg", "AMBUSYNC_EXPECTED_DATABASE_NAME=synthetic_l",
  "AMBUSYNC_EXPECTED_VALKEY_HOST=ambusync-l-kv", `AMBUSYNC_MIGRATION_APPROVAL_SHA=${approval}`,
].flatMap((value) => ["-e", value]);
try {
  // Copy tracked source and this task's uncommitted entrypoint into a disposable
  // context. Never expose this workstation's real .env or development mounts.
  const files = execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" }).split("\0");
  for (const file of [...files.filter((f) => /^(frontend|backend)\//.test(f)), "Dockerfile", ".dockerignore", "backend/config/deployment_start.py"]) {
    const destination = join(scratch, file);
    mkdirSync(dirname(destination), { recursive: true });
    copyFileSync(join(root, file), destination);
  }
  for (const file of [".env", "backend/.env", "frontend/.env.production", "backend/private.key", ".superpowers/private.dump"]) {
    mkdirSync(dirname(join(scratch, file)), { recursive: true });
    writeFileSync(join(scratch, file), marker);
  }
  console.log("Building a real image from an isolated synthetic context...");
  docker(["build", "--platform", "linux/amd64", "--build-arg", `AMBUSYNC_BUILD_SHA=${sha}`, "-t", image, scratch], 900000);
  const config = JSON.parse(docker(["image", "inspect", image]))[0];
  assert.equal(config.Config.User, "10001:10001");
  assert.ok(!JSON.stringify(config).includes(marker));
  assert.ok(!docker(["history", "--no-trunc", image]).includes(marker));
  const archive = join(scratch, "image.tar");
  docker(["image", "save", "--output", archive, image]);
  const python = join(root, "backend/.venv", process.platform === "win32" ? "Scripts/python.exe" : "bin/python");
  execFileSync(python, ["-c", `
import gzip,sys,tarfile
marker=b'${marker}'
with tarfile.open(sys.argv[1]) as archive:
 for item in archive:
  if not item.isfile(): continue
  raw=archive.extractfile(item).read()
  if raw.startswith(b'\\x1f\\x8b'): raw=gzip.decompress(raw)
  assert marker not in raw,'synthetic sentinel in image layer'
print('exported image layers contain no synthetic build secrets')
`, archive], { encoding: "utf8", timeout: 120000 });
  // Inspect every application artifact and installed tool, not just image metadata.
  const inspection = docker(["run", "--rm", "--network", "none", "--entrypoint", "python", image, "-c", `
import os,pathlib,shutil
assert os.getuid()!=0
for tool in ('node','npm','uv','gcc','cc','pip'): assert shutil.which(tool) is None,tool
for p in pathlib.Path('/app').rglob('*'):
 if p.is_file():
  assert '${marker}'.encode() not in p.read_bytes(),str(p)
assert not pathlib.Path('/app/.env').exists()
assert not pathlib.Path('/app/node_modules').exists()
assert not pathlib.Path('/app/.git').exists()
assert pathlib.Path('/app/frontend-dist/sw.js').is_file()
# Exercise symlink traversal on Linux, where Windows could not create one.
import tempfile
from django.conf import settings
with tempfile.TemporaryDirectory() as d:
 r=pathlib.Path(d); (r/'dist/assets').mkdir(parents=True)
 (r/'private.js').write_text('synthetic-private')
 (r/'dist/assets/outside-Ab12Cd34.js').symlink_to(r/'private.js')
 from config.frontend import artifact_map
 assert 'assets/outside-Ab12Cd34.js' not in artifact_map(str(r/'dist'))[1]
print('non-root, no private inputs/build tools, Linux symlink guard PASS')
`]);
  console.log(inspection);
  docker(["network", "create", "--label", `ambusync.smoke=${id}`, id]); networkCreated = true;
  run(names.pg, ["-d", "--network", id, "--network-alias", "ambusync-l-pg", "-e", "POSTGRES_USER=synthetic", "-e", "POSTGRES_PASSWORD=synthetic", "-e", "POSTGRES_DB=synthetic_l", pgImage]);
  run(names.kv, ["-d", "--network", id, "--network-alias", "ambusync-l-kv", kvImage]);
  await eventually(() => docker(["exec", names.pg, "pg_isready", "-U", "synthetic", "-d", "synthetic_l"]));
  // No approval, or a different SHA, must exit without listening/migrating.
  for (const approval of ["", "b".repeat(40)]) {
    run(names.probe, ["-d", "--network", id, ...env("https://localhost", approval), image]);
    assert.equal(docker(["wait", names.probe]), "1");
    assert.ok(!docker(["logs", names.probe]).includes("postgresql://"));
    remove(names.probe);
  }
  assert.equal(docker(["exec", names.pg, "psql", "-U", "synthetic", "-d", "synthetic_l", "-Atc", "SELECT count(*) FROM pg_tables WHERE schemaname='public'"]), "0");
  // Generate only a disposable loopback certificate; never trust it in the OS.
  const tls = JSON.parse(docker(["run", "--rm", "--network", "none", "--entrypoint", "python", image, "-c", `
import json,datetime,ipaddress
from cryptography import x509
from cryptography.x509.oid import NameOID
from cryptography.hazmat.primitives import hashes,serialization
from cryptography.hazmat.primitives.asymmetric import rsa
k=rsa.generate_private_key(public_exponent=65537,key_size=2048)
n=x509.Name([x509.NameAttribute(NameOID.COMMON_NAME,'localhost')])
now=datetime.datetime.now(datetime.UTC)
c=x509.CertificateBuilder().subject_name(n).issuer_name(n).public_key(k.public_key()).serial_number(x509.random_serial_number()).not_valid_before(now-datetime.timedelta(minutes=1)).not_valid_after(now+datetime.timedelta(hours=1)).add_extension(x509.SubjectAlternativeName([x509.DNSName('localhost'),x509.IPAddress(ipaddress.ip_address('127.0.0.1'))]),False).sign(k,hashes.SHA256())
print(json.dumps(dict(key=k.private_bytes(serialization.Encoding.PEM,serialization.PrivateFormat.PKCS8,serialization.NoEncryption()).decode(),cert=c.public_bytes(serialization.Encoding.PEM).decode())))
`]));
  let target;
  proxy = createHttpsServer(tls, (request, response) => {
    const upstream = httpRequest({ host: "127.0.0.1", port: target, path: request.url, method: request.method, headers: { ...request.headers, "x-forwarded-proto": "https" } }, (reply) => {
      response.writeHead(reply.statusCode, reply.headers); reply.pipe(response);
    });
    upstream.on("error", () => { if (!response.headersSent) response.writeHead(502); response.end(); });
    request.pipe(upstream);
  });
  proxy.on("upgrade", (request, socket, head) => {
    const upstream = httpRequest({ host: "127.0.0.1", port: target, path: request.url, headers: { ...request.headers, "x-forwarded-proto": "https" } });
    upstream.on("upgrade", (response, remote, remoteHead) => {
      socket.write(`HTTP/1.1 ${response.statusCode} Switching Protocols\r\n${Object.entries(response.headers).map(([k, v]) => `${k}: ${v}`).join("\r\n")}\r\n\r\n`);
      if (remoteHead.length) socket.write(remoteHead);
      if (head.length) remote.write(head);
      remote.pipe(socket); socket.pipe(remote);
      remote.on("error", () => socket.destroy()); socket.on("error", () => remote.destroy());
    });
    upstream.on("response", (response) => { socket.end(`HTTP/1.1 ${response.statusCode} Rejected\r\nConnection: close\r\n\r\n`); });
    upstream.on("error", () => socket.destroy());
    upstream.end();
  });
  await new Promise((resolve) => proxy.listen(0, "127.0.0.1", resolve));
  const origin = `https://localhost:${proxy.address().port}`;
  run(names.app, ["-d", "--network", id, "-p", "127.0.0.1::10000", ...env(origin), image]);
  target = Number(docker(["port", names.app, "10000/tcp"]).split(":").at(-1));
  const request = (path) => new Promise((resolve, reject) => {
    const req = httpsRequest(`${origin}${path}`, { ca: tls.cert, lookup: (_h, options, done) => {
      if (options.all) done(null, [{ address: "127.0.0.1", family: 4 }]);
      else done(null, "127.0.0.1", 4);
    }, timeout: 5000 }, (response) => {
      let body = ""; response.setEncoding("utf8"); response.on("data", (data) => body += data);
      response.on("end", () => resolve({ status: response.statusCode, headers: response.headers, body }));
    });
    req.on("timeout", () => req.destroy(new Error("Synthetic HTTP deadline")));
    req.on("error", reject); req.end();
  });
  await eventually(async () => assert.equal((await request("/health/ready/")).status, 200));
  for (const path of ["/", "/local", "/sistema", "/activar-cuenta", "/sw.js", "/manifest.webmanifest", "/icons/icon-192.png"]) {
    const result = await request(path); assert.equal(result.status, 200, path); assert.match(result.headers["cache-control"], /no-store/);
  }
  assert.equal((await request("/api/no-such-route")).status, 404);
  assert.equal((await request("/api/v1/auth/me/")).status, 401);
  assert.equal((await request("/api/v1/institutions/management/ambulances/10000000-0000-4000-8000-000000000123/reactivate/")).status, 401);
  // Provision TEST-only state by stdin; never reset/import development accounts.
  docker(["exec", "-i", names.app, "python", "manage.py", "shell"], 30000, `
from accounts.models import User
from django.contrib.auth.models import Group
from institutions.models import Institution,InstitutionMembership
i=Institution.objects.create(name='Synthetic container receiver',kind='receiver')
u=User.objects.create_user(username='synthetic-container',password='Synthetic-container-password-26!')
u.groups.add(Group.objects.get_or_create(name='urgencias')[0])
InstitutionMembership.objects.create(user=u,institution=i)
`);
  browser = await chromium.launch();
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();
  await page.goto(origin, { waitUntil: "networkidle", timeout: 15000 });
  const csrfResponse = await context.request.get(`${origin}/api/v1/auth/csrf/`);
  const csrf = (await csrfResponse.json()).csrf_token;
  const login = await context.request.post(`${origin}/api/v1/auth/login/`, {
    headers: { Origin: origin, "X-CSRFToken": csrf }, data: { username: "synthetic-container", password: "Synthetic-container-password-26!" },
  });
  assert.equal(login.status(), 200);
  const cookies = await context.cookies();
  assert.ok(cookies.find((c) => c.name === "sessionid" && c.secure && c.httpOnly));
  assert.ok(cookies.find((c) => c.name === "csrftoken" && c.secure));
  assert.equal((await context.request.get(`${origin}/api/v1/auth/me/`)).status(), 200);
  await page.reload();
  assert.equal(await page.evaluate((url) => new Promise((resolve) => {
    const ws = new WebSocket(url); const timeout = setTimeout(() => { ws.close(); resolve("timeout"); }, 5000);
    ws.onopen = () => { clearTimeout(timeout); ws.close(); resolve("open"); };
    ws.onerror = () => { clearTimeout(timeout); resolve("error"); };
  }), origin.replace("https:", "wss:") + "/ws/emergencies/"), "open");
  await request("/activar-cuenta?uid=synthetic&token=SYNTHETIC-QUERY-SECRET");
  await request("/api/no-such-route?token=SYNTHETIC-QUERY-SECRET");
  assert.ok(!docker(["logs", names.app]).includes("SYNTHETIC-QUERY-SECRET"));
  docker(["restart", names.app]);
  // Docker can allocate a new ephemeral host port on restart. The public
  // synthetic TLS origin stays stable; only its private upstream changes.
  target = Number(docker(["port", names.app, "10000/tcp"]).split(":").at(-1));
  await eventually(async () => assert.equal((await context.request.get(`${origin}/api/v1/auth/me/`)).status(), 200));
  const count = () => docker(["exec", names.pg, "psql", "-U", "synthetic", "-d", "synthetic_l", "-Atc", "SELECT (SELECT count(*) FROM accounts_user), (SELECT count(*) FROM institutions_institution), (SELECT count(*) FROM emergencies_emergency)"]);
  const before = count();
  docker(["stop", names.kv]);
  assert.equal((await context.request.get(`${origin}/api/v1/auth/me/`)).status(), 200);
  assert.equal((await request("/health/ready/")).status, 200);
  assert.equal(count(), before);
  await context.close();
  console.log("Real image + migration gates + HTTPS/CSRF/session/WSS + restart + KeyValue-loss isolation PASS");
} catch (error) {
  if (owned.has(names.app)) {
    console.error("Synthetic app state:", docker(["inspect", "--format", "{{.State.Status}} exit={{.State.ExitCode}}", names.app]));
    console.error("Synthetic app logs:", docker(["logs", names.app]).slice(-4000));
  }
  throw error;
} finally {
  await browser?.close();
  if (proxy) {
    proxy.closeAllConnections();
    await new Promise((resolve) => proxy.close(resolve));
  }
  for (const name of [...owned].reverse()) remove(name);
  if (networkCreated) docker(["network", "rm", id]);
  // Scratch contains only this test's source copy and synthetic sentinels.
  rmSync(scratch, { recursive: true, force: true });
}
