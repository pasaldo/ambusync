// Real Mailpit/Caddy, isolated network, synthetic messages and credentials only.
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const versions = JSON.parse(readFileSync(join(root, "ops/deploy/mailbox/versions.json")));
const id = `ambusync-mailbox-proxy-${process.pid}-${Date.now()}`;
const scratch = mkdtempSync(join(process.env.LOCALAPPDATA, "Temp/opencode/mailbox-proxy-"));
const password = randomBytes(24).toString("hex");
const auth = `Basic ${Buffer.from(`operador:${password}`).toString("base64")}`;
const origin = "https://synthetic-l.onrender.com";
let created = false, network = false, ingress = false, relay = false, browser;
function docker(args, input, timeout = 120000) {
  const r = spawnSync("docker", args, { cwd: root, input, encoding: "utf8", timeout, maxBuffer: 10e6 });
  if (r.status !== 0 && created && args[0] !== "rm") {
    if (args[0] === "port") console.error("Port diagnostic:", r.stderr);
    console.error("State:", spawnSync("docker", ["inspect", "--format", "{{json .State}}", id], { encoding: "utf8" }).stdout);
    const logs = spawnSync("docker", ["logs", id], { encoding: "utf8" });
    console.error((logs.stderr || "").replaceAll(password, "[redacted]").replaceAll(auth, "[redacted]")
      .replace(/\$2[aby]\$\d\d\$[./A-Za-z0-9]+/g, "[redacted-hash]"));
  }
  assert.equal(r.status, 0, `Docker operation failed (${args[0]}); no private output displayed`);
  return r.stdout.trim();
}
async function eventually(check) {
  const end = Date.now() + 45000;
  let last;
  while (Date.now() < end) {
    try { return await check(); } catch (e) { last = e; }
    await new Promise(r => setTimeout(r, 200));
  }
  throw last;
}
try {
  copyFileSync(join(root, "ops/deploy/mailbox/Caddyfile"), join(scratch, "Caddyfile"));
  writeFileSync(join(scratch, "Dockerfile"), `
FROM ${versions.mailpit.image} AS mailpit
FROM ${versions.caddy.image} AS caddy
FROM python:3.14.10-slim-bookworm@sha256:3fe1a0b6c2d6b2ebb572906cdabeca75aeb558c0c17db5ffefbcf8094871c32b
COPY --from=mailpit /mailpit /usr/local/bin/mailpit
COPY --from=caddy /usr/bin/caddy /usr/local/bin/caddy
COPY Caddyfile /etc/caddy/Caddyfile
USER 10001:10001
ENV HOME=/tmp XDG_CONFIG_HOME=/tmp XDG_DATA_HOME=/tmp
ENTRYPOINT ["sh","-c","mailpit --smtp 127.0.0.1:1025 --listen 127.0.0.1:8025 --webroot buzón-placeholder --max 100 --max-age 24h --disable-version-check --smtp-disable-rdns --quiet >/dev/null 2>&1 & python -m http.server 8000 --bind 127.0.0.1 >/dev/null 2>&1 & exec caddy run --config /etc/caddy/Caddyfile --adapter caddyfile"]
`.replace("buzón-placeholder", "buzon-pruebas"));
  docker(["build", "-q", "-t", id, scratch], undefined, 300000);
  const hash = docker(["run", "--rm", "-i", "--network", "none", "--entrypoint", "caddy", id, "hash-password", "--algorithm", "bcrypt"], password + "\n");
  docker(["network", "create", "--internal", "--label", `ambusync.test=${id}`, id]); network = true;
  docker(["network", "create", "--label", `ambusync.test=${id}`, `${id}-ingress`]); ingress = true;
  docker(["run", "-d", "--name", id, "--label", `ambusync.test=${id}`, "--network", id,
    "-e", "PORT=10000",
    "-e", `AMBUSYNC_TEST_MAILBOX_PASSWORD_HASH=${hash}`, "-e", `AMBUSYNC_PUBLIC_ORIGIN=${origin}`, id]);
  created = true;
  // Docker 29 does not publish ports on internal networks. A one-purpose ingress
  // relay bridges host tests to the isolated runtime; it has no mail credentials.
  docker(["run", "-d", "--name", `${id}-relay`, "--network", `${id}-ingress`,
    "--label", `ambusync.test=${id}`, "-p", "127.0.0.1::10000", versions.caddy.image,
    "caddy", "reverse-proxy", "--from", ":10000", "--to", `http://${id}:10000`]);
  relay = true;
  docker(["network", "connect", id, `${id}-relay`]);
  const port = docker(["port", `${id}-relay`, "10000/tcp"]).split(":").at(-1);
  const base = `http://127.0.0.1:${port}`;
  async function request(path, { authenticated = true, headers = {}, ...options } = {}) {
    return fetch(base + path, { redirect: "manual", ...options,
      headers: { ...(authenticated ? { Authorization: auth } : {}), ...headers } });
  }
  await eventually(async () => assert.equal((await request("/buzon-pruebas/api/v1/messages")).status, 200));
  for (const path of ["/buzon-pruebas/", "/buzon-pruebas/api/v1/messages",
    "/buzon-pruebas/dist/app.js", "/buzon-pruebas/api/events",
    "/buzon-pruebas/api/v1/send", "/buzon-pruebas/view/latest"]) {
    assert.equal((await request(path, { authenticated: false })).status, 401, path);
  }
  assert.equal((await request("/buzon-pruebas/", { headers: { Authorization: "Basic d3Jvbmc6d3Jvbmc=" } })).status, 401);
  for (const path of ["/api/v1/send", "/api/v1/chaos", "/proxy", "/metrics",
    "/api/v1/message/SYNTHETIC/link-check", "/api/v1/message/SYNTHETIC/release",
    "/api/v1/message/SYNTHETIC/html-check", "/api/v1/message/SYNTHETIC/sa-check"]) {
    for (const method of ["GET", "POST"]) assert.equal((await request("/buzon-pruebas" + path, { method })).status, 404);
  }
  for (const method of ["PUT", "DELETE"]) {
    assert.equal((await request("/buzon-pruebas/api/v1/messages", { method, headers: { Origin: "https://evil.invalid" } })).status, 403);
    assert.equal((await request("/buzon-pruebas/api/v1/messages", { method })).status, 403);
  }
  for (const path of ["/buzon-pruebas//api/v1/messages", "/%62uzon-pruebas/api/v1/messages",
    "/buzon-pruebas/api/../api/v1/messages", "/buzon-pruebas/api%2fv1/messages"]) {
    const r = await request(path, { authenticated: false });
    assert.notEqual(r.status, 200, path);
  }
  // SMTP enters the same private namespace, not an exposed host port.
  docker(["exec", "-i", id, "python", "-"], `
import smtplib
from email.message import EmailMessage
m=EmailMessage();m['From']='test@example.invalid';m['To']='user@example.invalid'
m['Subject']='Synthetic Mailpit activation'
m.set_content('https://synthetic-l.onrender.com/activar-cuenta#uid=synthetic&token=PRIVATE-LINK-SENTINEL')
with smtplib.SMTP('127.0.0.1',1025,timeout=3) as s:s.send_message(m)
`);
  const listing = await (await request("/buzon-pruebas/api/v1/messages")).json();
  assert.equal(listing.total, 1);
  const messageID = listing.messages[0].ID;
  const detail = await (await request(`/buzon-pruebas/api/v1/message/${messageID}`)).json();
  assert.ok(detail.Text.includes("#uid=synthetic&token=PRIVATE-LINK-SENTINEL"));
  const html = await request("/buzon-pruebas/");
  assert.match(html.headers.get("cache-control"), /no-store/);
  assert.equal(html.headers.get("referrer-policy"), "no-referrer");
  assert.equal(html.headers.get("set-cookie"), null);
  assert.match(html.headers.get("content-security-policy"), /img-src 'self' data:/);
  const require = createRequire(join(root, "frontend/package.json"));
  const { chromium } = require("playwright");
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ httpCredentials: { username: "operador", password } });
  const page = await context.newPage();
  await page.goto(base + "/buzon-pruebas/");
  await page.getByText("Synthetic Mailpit activation", { exact: true }).first().waitFor();
  await page.getByText("Synthetic Mailpit activation", { exact: true }).first().click();
  await page.getByText(/PRIVATE-LINK-SENTINEL/).first().waitFor();
  const ws = await context.request.get(base + "/buzon-pruebas/api/events", {
    headers: { Origin: "https://evil.invalid", Upgrade: "websocket", Connection: "Upgrade" },
  });
  assert.equal(ws.status(), 403);
  await context.close();
  assert.equal((await request("/buzon-pruebas/api/v1/messages", { method: "PUT",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify({ IDs: [messageID], Read: true }) })).status, 200);
  assert.equal((await request("/buzon-pruebas/api/v1/messages", { method: "DELETE",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify({ IDs: [messageID] }) })).status, 200);
  const logs = docker(["logs", id]);
  assert.ok(!logs.includes(password) && !logs.includes("PRIVATE-LINK-SENTINEL"));
  console.log("PASS: real Mailpit capture/UI/read/delete; private Caddy API/routes/Origin/CSP; no external network.");
} finally {
  await browser?.close();
  if (relay) docker(["rm", "-f", "-v", `${id}-relay`]);
  if (created) docker(["rm", "-f", "-v", id]);
  if (network) docker(["network", "rm", id]);
  if (ingress) docker(["network", "rm", `${id}-ingress`]);
  // Remove only this run's exact image and temporary directory.
  spawnSync("docker", ["image", "rm", id], { stdio: "pipe" });
  rmSync(scratch, { recursive: true, force: true });
}
