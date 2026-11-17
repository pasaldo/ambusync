import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { randomBytes } from "node:crypto";
import { createServer as createHttpsServer, request as httpsRequest } from "node:https";
import { request as httpRequest } from "node:http";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const versions = JSON.parse(readFileSync(join(root, "ops/deploy/mailbox/versions.json")));
const require = createRequire(join(root, "frontend/package.json"));
const { chromium } = require("playwright");
const id = `ambusync-capture-${process.pid}-${Date.now()}`;
const scratch = mkdtempSync(join(process.env.LOCALAPPDATA, "Temp/opencode/capture-image-"));
const image = `${id}:test`;
const sha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
const owned = [], networks = [], secrets = [];
let browser, proxy, target;
function docker(args, input, timeout = 120000) {
  const result = spawnSync("docker", args, {
    cwd: root, input, encoding: "utf8", timeout, maxBuffer: 32e6, stdio: ["pipe", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    let diagnostic = result.stderr || "";
    for (const value of secrets) diagnostic = diagnostic.replaceAll(value, "[redacted]");
    // Scripts use synthetic values only; omit any potentially echoed source line.
    const safeLines = diagnostic.split("\n").filter(line =>
      /^(Traceback|  File |[A-Za-z]+Error[: ]|AssertionError)/.test(line)).join("\n");
    if (safeLines) console.error("Test subprocess diagnostic:", safeLines);
    throw Error(`Isolated Docker ${args[0]} failed; private output suppressed`);
  }
  return result.stdout.trim();
}
function run(name, args) {
  docker(["run", "--name", name, "--label", `ambusync.capture=${id}`, ...args]);
  owned.push(name);
}
function remove(name) {
  if (!owned.includes(name)) return;
  assert.equal(docker(["inspect", "--format", '{{index .Config.Labels "ambusync.capture"}}', name]), id);
  docker(["rm", "-f", "-v", name]);
  owned.splice(owned.indexOf(name), 1);
}
async function eventually(check, seconds = 90) {
  let last;
  const end = Date.now() + seconds * 1000;
  while (Date.now() < end) {
    try { return await check(); } catch (error) { last = error; }
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  throw last;
}
function shell(script) {
  return docker(["exec", "-i", `${id}-app`, "python", "manage.py", "shell", "-v", "0"], script, 60000);
}
const stats = [];
function sample(stage) {
  const value = JSON.parse(docker(["stats", "--no-stream", "--format", "{{json .}}", `${id}-app`]));
  stats.push({ stage, memory: value.MemUsage, cpu: value.CPUPerc });
  const n = value.MemUsage.split("/")[0].trim();
  const bytes = parseFloat(n) * (/GiB/.test(n) ? 1024 ** 3 : /MiB/.test(n) ? 1024 ** 2 : /KiB/.test(n) ? 1024 : 1);
  assert.ok(bytes < 512 * 1024 ** 2, "Runtime exceeds 512MiB test ceiling");
}
try {
  const files = execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" }).split("\0");
  for (const file of files.filter(f => /^(backend|frontend)\//.test(f)).concat(
    ["Dockerfile", ".dockerignore", "ops/deploy/mailbox/Caddyfile"])) {
    mkdirSync(dirname(join(scratch, file)), { recursive: true });
    copyFileSync(join(root, file), join(scratch, file));
  }
  console.log("Building final capture image from isolated tracked-source context...");
  docker(["build", "--platform", "linux/amd64", "--build-arg", `AMBUSYNC_BUILD_SHA=${sha}`, "-t", image, scratch], undefined, 900000);
  assert.equal(docker(["image", "inspect", "--format", "{{.Config.User}}", image]), "10001:10001");
  const mailboxPassword = randomBytes(24).toString("hex");
  secrets.push(mailboxPassword);
  const hash = docker(["run", "--rm", "-i", "--network", "none", "--entrypoint", "caddy",
    image, "hash-password", "--algorithm", "bcrypt", "--bcrypt-cost", "12"], mailboxPassword + "\n");
  secrets.push(hash);
  docker(["network", "create", "--internal", "--label", `ambusync.capture=${id}`, id]); networks.push(id);
  docker(["network", "create", "--label", `ambusync.capture=${id}`, `${id}-ingress`]); networks.push(`${id}-ingress`);
  run(`${id}-pg`, ["-d", "--network", id, "--network-alias", "ambusync-l-pg",
    "-e", "POSTGRES_USER=synthetic", "-e", "POSTGRES_PASSWORD=synthetic", "-e", "POSTGRES_DB=synthetic_l",
    "postgres:17-bookworm@sha256:40865bc877a289da75963d97d72b59633f639fc5af7a4e856bfa3714cae5b536"]);
  run(`${id}-kv`, ["-d", "--network", id, "--network-alias", "ambusync-l-kv",
    "valkey/valkey:8-alpine@sha256:2602ace2be6569bc2bbb06f873776516ab9089821525be34f4305c67eb9db02a"]);
  await eventually(() => docker(["exec", `${id}-pg`, "pg_isready", "-U", "synthetic"]));
  const tls = JSON.parse(docker(["run", "--rm", "--network", "none", "--entrypoint", "python", image, "-c", `
import datetime,ipaddress,json
from cryptography import x509
from cryptography.x509.oid import NameOID
from cryptography.hazmat.primitives import hashes,serialization
from cryptography.hazmat.primitives.asymmetric import rsa
k=rsa.generate_private_key(public_exponent=65537,key_size=2048)
n=x509.Name([x509.NameAttribute(NameOID.COMMON_NAME,'localhost')]);now=datetime.datetime.now(datetime.UTC)
c=x509.CertificateBuilder().subject_name(n).issuer_name(n).public_key(k.public_key()).serial_number(x509.random_serial_number()).not_valid_before(now-datetime.timedelta(minutes=1)).not_valid_after(now+datetime.timedelta(hours=1)).add_extension(x509.SubjectAlternativeName([x509.DNSName('localhost'),x509.IPAddress(ipaddress.ip_address('127.0.0.1'))]),False).sign(k,hashes.SHA256())
print(json.dumps({'key':k.private_bytes(serialization.Encoding.PEM,serialization.PrivateFormat.PKCS8,serialization.NoEncryption()).decode(),'cert':c.public_bytes(serialization.Encoding.PEM).decode()}))
`]));
  secrets.push(tls.key);
  proxy = createHttpsServer(tls, (req, res) => {
    const upstream = httpRequest({ host: "127.0.0.1", port: target, method: req.method, path: req.url,
      headers: { ...req.headers, "x-forwarded-proto": "https" } }, reply => { res.writeHead(reply.statusCode, reply.headers); reply.pipe(res); });
    upstream.on("error", () => { if (!res.headersSent) res.writeHead(502); res.end(); });
    req.pipe(upstream);
  });
  proxy.on("upgrade", (req, socket, head) => {
    const upstream = httpRequest({ host: "127.0.0.1", port: target, path: req.url,
      headers: { ...req.headers, "x-forwarded-proto": "https" } });
    upstream.on("upgrade", (reply, remote, initial) => {
      socket.write(`HTTP/1.1 101 Switching Protocols\r\n${Object.entries(reply.headers).map(([k, v]) => `${k}: ${v}`).join("\r\n")}\r\n\r\n`);
      if (initial.length) socket.write(initial); if (head.length) remote.write(head);
      remote.pipe(socket); socket.pipe(remote);
      remote.on("error", () => socket.destroy()); socket.on("error", () => remote.destroy());
    });
    upstream.on("response", r => socket.end(`HTTP/1.1 ${r.statusCode} Rejected\r\nConnection: close\r\n\r\n`));
    upstream.on("error", () => socket.destroy()); upstream.end();
  });
  await new Promise(resolve => proxy.listen(0, "127.0.0.1", resolve));
  const origin = `https://localhost:${proxy.address().port}`;
  const environment = {
    DJANGO_SECRET_KEY: randomBytes(48).toString("hex"), FRONTEND_BASE_URL: origin,
    AMBUSYNC_LOCAL_SMOKE: "1", AMBUSYNC_DATABASE_NETWORK: "smoke",
    DATABASE_URL: "postgresql://synthetic:synthetic@ambusync-l-pg/synthetic_l?sslmode=disable",
    VALKEY_URL: "redis://ambusync-l-kv:6379/0", AMBUSYNC_EXPECTED_DATABASE_HOST: "ambusync-l-pg",
    AMBUSYNC_EXPECTED_DATABASE_NAME: "synthetic_l", AMBUSYNC_EXPECTED_VALKEY_HOST: "ambusync-l-kv",
    AMBUSYNC_MIGRATION_APPROVAL_SHA: sha, AMBUSYNC_MAIL_MODE: "mailpit",
    AMBUSYNC_TEST_MAILBOX_PASSWORD_HASH: hash,
  };
  const start = () => run(`${id}-app`, ["-d", "--network", id, "--network-alias", "capture-app",
    "--memory", "512m", "--cpus", "0.1",
    ...Object.entries(environment).flatMap(([k, v]) => ["-e", `${k}=${v}`]), image]);
  start();
  run(`${id}-relay`, ["-d", "--network", `${id}-ingress`, "-p", "127.0.0.1::10000", versions.caddy.image,
    "caddy", "reverse-proxy", "--from", ":10000", "--to", "http://capture-app:10000"]);
  docker(["network", "connect", id, `${id}-relay`]);
  target = Number(docker(["port", `${id}-relay`, "10000/tcp"]).split(":").at(-1));
  async function tlsProbe() {
    return new Promise((resolve, reject) => {
      const req = httpsRequest(origin + "/health/ready/", { ca: tls.cert, timeout: 5000,
        lookup: (_host, options, done) => options.all ? done(null, [{ address: "127.0.0.1", family: 4 }]) : done(null, "127.0.0.1", 4) },
      res => { res.resume(); resolve({ status: res.statusCode, tlsVerified: res.socket.authorized }); });
      req.on("error", reject); req.on("timeout", () => req.destroy(Error("Synthetic readiness deadline"))); req.end();
    });
  }
  await eventually(async () => assert.deepEqual(await tlsProbe(), { status: 200, tlsVerified: true }), 150);
  sample("ready");
  console.log("Real capture unit ready within 512MiB/0.1CPU test limits.");
  // Confirm actual kernel listeners, process user IDs, minimal child environments and no route outside the private network.
  const inspection = JSON.parse(docker(["exec", "-i", `${id}-app`, "python", "-"], `
import json,os,pathlib,socket
assert os.getuid()==10001
for executable in ('/usr/local/bin/caddy','/usr/local/bin/mailpit'):
 assert 'security.capability' not in os.listxattr(executable),'Runtime binary carries unnecessary file capabilities'
children=[]
for p in pathlib.Path('/proc').iterdir():
 if p.name.isdigit():
  try:
   cmd=(p/'cmdline').read_bytes().split(b'\\0')[0].decode()
   if cmd.endswith(('mailpit','caddy')):
    try:e=(p/'environ').read_bytes()
    except PermissionError:
     status=[line for line in (p/'status').read_text().splitlines() if line.startswith(('Uid:','Gid:','CapEff:'))]
     raise AssertionError('Child diagnostic '+cmd+' '+str(status)+' xattrs='+str(os.listxattr(cmd)))
    assert b'DATABASE_URL=' not in e and b'BREVO_' not in e and b'GEOAPIFY_' not in e
    children.append(cmd.rsplit('/',1)[-1])
  except (FileNotFoundError,ProcessLookupError):pass
assert sorted(children)==['caddy','mailpit']
ports={}
for line in pathlib.Path('/proc/net/tcp').read_text().splitlines()[1:]:
 parts=line.split()
 if parts[3]=='0A':
  address,port=parts[1].split(':');ports[int(port,16)]=address
for port in (1025,8000,8025):assert ports.get(port)=='0100007F'
try:
 socket.create_connection(('1.1.1.1',443),timeout=1)
 raise AssertionError('External route unexpectedly available')
except OSError:pass
print(json.dumps({'loopbackOnly':True,'childSecretsSeparated':True,'externalRouteUnavailable':True}))
`));
  assert.ok(inspection.loopbackOnly && inspection.childSecretsSeparated && inspection.externalRouteUnavailable);
  browser = await chromium.launch();
  const admin = await browser.newContext({ ignoreHTTPSErrors: true });
  const inbox = await browser.newContext({ ignoreHTTPSErrors: true, httpCredentials: { username: "operador", password: mailboxPassword } });
  const user = await browser.newContext({ ignoreHTTPSErrors: true });
  const anonymous = await browser.newContext({ ignoreHTTPSErrors: true });
  const adminPassword = randomBytes(24).toString("hex"), userPassword = randomBytes(24).toString("hex");
  secrets.push(adminPassword, userPassword);
  shell(`
import io
from unittest.mock import patch
from django.core.management import call_command
with patch('accounts.management.commands.create_system_admin.getpass',return_value=${JSON.stringify(adminPassword)}):
 call_command('create_system_admin','synthetic-system','system@example.invalid',stdout=io.StringIO(),stderr=io.StringIO())
`);
  async function post(context, path, data) {
    const csrf = await (await context.request.get(origin + "/api/v1/auth/csrf/")).json();
    return context.request.post(origin + path, { headers: { Origin: origin, "X-CSRFToken": csrf.csrf_token }, data, timeout: 60000 });
  }
  assert.equal((await post(admin, "/api/v1/auth/login/", { username: "synthetic-system", password: adminPassword })).status(), 200);
  assert.equal((await admin.request.get(origin + "/buzon-pruebas/")).status(), 401, "Django admin session does not unlock technical inbox");
  for (const path of ["/", "/manifest.webmanifest", "/sw.js", "/icons/icon-192.png"]) assert.equal((await anonymous.request.get(origin + path)).status(), 200);
  assert.equal((await anonymous.request.get(origin + "/api/unknown")).status(), 404);
  assert.equal((await anonymous.request.get(origin + "/api/v1/auth/me/")).status(), 401);
  async function createInstitution(name, rut, username) {
    const result = await post(admin, "/api/v1/system/institutions/", { name, rut, address: "Calle sintetica 1",
      phone: "", email: `${username}-contact@example.invalid`, first_username: username,
      first_email: `${username}@example.invalid`, location_selection: null });
    assert.equal(result.status(), 201, "Institution creation must capture activation atomically");
    const body = await result.json(); assert.equal(body.mail_delivery_mode, "mailpit"); return body;
  }
  async function messages() { return (await (await inbox.request.get(origin + "/buzon-pruebas/api/v1/messages", { timeout: 60000 })).json()).messages; }
  async function linkFor(subject, path) {
    return eventually(async () => {
      const entry = (await messages()).find(item => item.Subject === subject);
      assert.ok(entry, "Expected captured message");
      const detail = await (await inbox.request.get(origin + `/buzon-pruebas/api/v1/message/${entry.ID}`)).json();
      const link = detail.Text.split(/\s+/).find(word => word.startsWith(origin + path + "#"));
      assert.ok(link); const url = new URL(link); secrets.push(url.hash.slice(1));
      assert.equal(url.search, ""); return Object.fromEntries(new URLSearchParams(url.hash.slice(1)));
    }, 60);
  }
  await createInstitution("Hospital Sintetico Uno", "76.125.185-6", "synthetic-first");
  const activation = await linkFor("Activa tu cuenta de AmbuSync", "/activar-cuenta");
  const body = { ...activation, password: userPassword, password_confirmation: userPassword };
  assert.equal((await post(user, "/api/v1/auth/activate/", body)).status(), 200);
  assert.equal((await user.request.get(origin + "/api/v1/auth/me/")).status(), 401);
  assert.equal((await post(user, "/api/v1/auth/activate/", body)).status(), 400);
  assert.equal((await post(user, "/api/v1/auth/login/", { username: "synthetic-first", password: userPassword })).status(), 200);
  const cookies = await user.cookies();
  assert.ok(cookies.some(c => c.name === "sessionid" && c.secure && c.httpOnly));
  assert.ok(cookies.some(c => c.name === "csrftoken" && c.secure));
  const page = await user.newPage();
  await page.goto(origin + "/local");
  const socketState = await page.evaluate(url => new Promise(resolve => {
    const ws = new WebSocket(url), timer = setTimeout(() => { ws.close(); resolve("timeout"); }, 10000);
    ws.onopen = () => { clearTimeout(timer); ws.close(); resolve("open"); };
    ws.onerror = () => { clearTimeout(timer); resolve("error"); };
  }), origin.replace("https:", "wss:") + "/ws/emergencies/");
  assert.equal(socketState, "open");
  assert.equal((await post(anonymous, "/api/v1/auth/recovery/request/", { email: "synthetic-first@example.invalid" })).status(), 202);
  const recovery = await linkFor("Recupera tu cuenta de AmbuSync", "/restablecer-cuenta");
  const newPassword = randomBytes(24).toString("hex"); secrets.push(newPassword);
  const recoveryBody = { ...recovery, password: newPassword, password_confirmation: newPassword };
  assert.equal((await post(anonymous, "/api/v1/auth/recovery/complete/", recoveryBody)).status(), 200);
  assert.equal((await anonymous.request.get(origin + "/api/v1/auth/me/")).status(), 401);
  assert.equal((await post(anonymous, "/api/v1/auth/recovery/complete/", recoveryBody)).status(), 400);
  assert.equal((await user.request.get(origin + "/api/v1/auth/me/")).status(), 401);
  const pending = await createInstitution("Hospital Sintetico Dos", "76.123.456-0", "synthetic-pending");
  sample("activation-and-recovery");
  const userCount = shell("from accounts.models import User\nprint(User.objects.count())");
  // Gracefully stop the whole unit and recreate it, preserving only PostgreSQL.
  docker(["stop", "--time", "15", `${id}-app`], undefined, 30000);
  assert.equal(docker(["inspect", "--format", "{{.State.ExitCode}}", `${id}-app`]), "0");
  remove(`${id}-app`); start();
  await eventually(async () => assert.equal((await tlsProbe()).status, 200), 150);
  assert.equal((await messages()).length, 0);
  assert.equal(shell("from accounts.models import User\nprint(User.objects.count())"), userCount);
  assert.equal((await admin.request.get(origin + "/api/v1/auth/me/")).status(), 200);
  shell(`
from accounts.models import AccountActivation,User
from django.utils import timezone
from datetime import timedelta
AccountActivation.objects.filter(user__username='synthetic-pending').update(expires_at=timezone.now()+timedelta(hours=23))
`);
  assert.equal((await post(admin, `/api/v1/system/institutions/${pending.id}/resend-first-activation/`, {})).status(), 204);
  const replacement = await linkFor("Activa tu cuenta de AmbuSync", "/activar-cuenta");
  assert.equal((await post(anonymous, "/api/v1/auth/activate/", {
    ...replacement, password: userPassword, password_confirmation: userPassword,
  })).status(), 200);
  assert.equal(shell("from accounts.models import User\nprint(User.objects.count())"), userCount);
  sample("after-recreate-and-resend");
  // Killing a child must take the single unit down, never leave a half-working app.
  docker(["exec", "-i", `${id}-app`, "python", "-"], `
import os,pathlib,signal
for p in pathlib.Path('/proc').iterdir():
 if p.name.isdigit():
  try:
   if (p/'cmdline').read_bytes().split(b'\\0')[0]==b'/usr/local/bin/mailpit':os.kill(int(p.name),signal.SIGTERM)
  except (FileNotFoundError,ProcessLookupError):pass
`);
  assert.equal(docker(["wait", `${id}-app`], undefined, 30000), "1");
  const logs = docker(["logs", `${id}-app`]);
  for (const secret of secrets) assert.ok(!logs.includes(secret), "Runtime log exposed private test material");
  console.log(JSON.stringify({ status: "PASS", captureActivationLogin: true, recoverySingleUseNoAutoLogin: true,
    ephemeralInboxPersistentAccounts: true, explicitResend: true, privateInboxIndependent: true,
    httpsCsrfSessionWss: true, noExternalRoute: true, gracefulStopAndChildFailure: true, samples: stats }));
} catch (error) {
  if (owned.includes(`${id}-app`)) console.error("Capture test app state:",
    docker(["inspect", "--format", "{{.State.Status}} exit={{.State.ExitCode}} oom={{.State.OOMKilled}}", `${id}-app`]));
  // Assertions identify a stage, never print HTTP bodies, credentials or mail text.
  throw error;
} finally {
  await browser?.close();
  if (proxy) { proxy.closeAllConnections(); await new Promise(resolve => proxy.close(resolve)); }
  for (const name of [...owned].reverse()) remove(name);
  for (const name of networks.reverse()) docker(["network", "rm", name]);
  spawnSync("docker", ["image", "rm", image], { stdio: "pipe" });
  rmSync(scratch, { recursive: true, force: true });
}
