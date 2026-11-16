import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { mockAuthenticatedApi } from "./mock-auth-api.mjs";

const dist = fileURLToPath(new URL("../dist/", import.meta.url));
const shots = fileURLToPath(new URL("../../.superpowers/sdd/2026-11-16-block-k-implementation/", import.meta.url));
let browser;
before(async () => { browser = await chromium.launch(); await mkdir(shots, { recursive: true }); });
after(async () => { await browser?.close(); });
const types = { ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".webmanifest": "application/manifest+json", ".html": "text/html" };

async function harness({ groups = ["ambulance"], init, viewport = { width: 1280, height: 900 }, swFail = false } = {}) {
  const state = { revision: 1, swFail };
  const server = createServer(async (req, res) => {
    try {
      const pathname = new URL(req.url, "http://localhost").pathname;
      if (pathname === "/sw.js" && state.swFail) { res.writeHead(503); res.end(); return; }
      const relative = pathname === "/" || !path.extname(pathname) ? "index.html" : decodeURIComponent(pathname).slice(1);
      const target = path.resolve(dist, relative);
      if (!target.startsWith(dist)) { res.writeHead(403); res.end(); return; }
      let bytes = await readFile(target);
      if (pathname === "/sw.js") bytes = Buffer.concat([bytes, Buffer.from(`\n// synthetic deployment ${state.revision}\n`)]);
      res.writeHead(200, { "Content-Type": types[path.extname(target)] || "application/octet-stream", "Cache-Control": "no-store" });
      res.end(bytes);
    } catch { res.writeHead(404); res.end(); }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const context = await browser.newContext({ viewport });
  await mockAuthenticatedApi(context, { groups });
  await context.addInitScript(() => {
    window.WebSocket = class extends EventTarget { readyState = 0; close() {} };
  });
  if (init) await context.addInitScript(init);
  const page = await context.newPage();
  page.setDefaultTimeout(7000);
  await page.goto(base);
  return {
    page, context, base, state,
    async close() { await context.close(); server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); },
  };
}

async function installed(page) {
  await page.waitForFunction(async () => !!(await navigator.serviceWorker.getRegistration())?.active, { timeout: 7000 });
}
async function login(page) {
  await page.getByLabel("Usuario", { exact: true }).fill("synthetic_ambulance");
  await page.getByLabel("Contraseña", { exact: true }).fill("synthetic-test-password");
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await page.getByLabel(/Destino receptor/).waitFor();
}
async function update(h) {
  h.state.revision++;
  await h.page.evaluate(async () => { await (await navigator.serviceWorker.getRegistration()).update(); });
  await h.page.waitForFunction(async () => !!(await navigator.serviceWorker.getRegistration())?.waiting);
  try { await h.page.getByText("Nueva versión disponible", { exact: true }).waitFor(); }
  catch (error) {
    console.error("PWA update diagnostic:", await h.page.evaluate(async () => {
      const r = await navigator.serviceWorker.getRegistration();
      return { waiting: r?.waiting?.state, installing: r?.installing?.state, active: r?.active?.state, notice: document.querySelector('aside[aria-label="Aplicación y conexión"]')?.textContent };
    }));
    throw error;
  }
}

test("built app links valid installation resources, enables zoom and registers its real worker", async () => {
  const h = await harness();
  try {
    assert.equal(await h.page.locator('link[rel="manifest"]').count(), 1);
    assert.doesNotMatch(await h.page.locator('meta[name="viewport"]').getAttribute("content"), /user-scalable=no|maximum-scale=1/);
    await installed(h.page);
    const cdp = await h.context.newCDPSession(h.page);
    const result = await cdp.send("Page.getAppManifest");
    assert.equal(result.errors.length, 0);
    assert.equal(JSON.parse(result.data).name, "AmbuSync");
    assert.equal((await h.context.request.get(`${h.base}/icons/apple-touch-icon.png`)).status(), 200);
    assert.match(await (await h.context.request.get(`${h.base}/sw.js`)).text(), /Build: [a-f0-9]{16}/);
  } finally { await h.close(); }
});

test("update waits for every old client, preserving an open draft without controller changes", async () => {
  const h = await harness();
  try {
    await installed(h.page);
    await h.page.reload(); // first installation deliberately does not claim the current document
    await login(h.page);
    await h.page.getByLabel(/Motivo de consulta/).fill("Borrador sintético que no debe perderse");
    const other = await h.context.newPage();
    await other.goto(h.base);
    await other.getByLabel(/Motivo de consulta/).waitFor();
    await other.evaluate(() => {
      Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await h.page.bringToFront();
    await h.page.evaluate(() => {
      window.controllerChanges = 0;
      navigator.serviceWorker.addEventListener("controllerchange", () => window.controllerChanges++);
    });
    await update(h);
    assert.equal(await h.page.getByLabel(/Motivo de consulta/).inputValue(), "Borrador sintético que no debe perderse");
    assert.equal(await h.page.evaluate(() => window.controllerChanges), 0);
    assert.equal(await h.page.getByRole("button", { name: /Actualizar aplicación|Recargar aplicación/ }).count(), 0);
    // Worker handles are retained by the context even after old clients close.
    const sw = h.context.serviceWorkers().at(-1);
    await h.page.close();
    assert.equal(await other.evaluate(() => document.visibilityState), "hidden");
    assert.ok(await other.evaluate(async () => !!(await navigator.serviceWorker.getRegistration()).waiting), "one remaining client must defer activation");
    await other.close();
    await sw.evaluate(() => new Promise((resolve) => {
      if (!self.registration.waiting) return resolve();
      self.addEventListener("activate", () => resolve(), { once: true });
    }));
    const fresh = await h.context.newPage();
    await fresh.goto(h.base);
    assert.equal(await fresh.evaluate(async () => (await navigator.serviceWorker.getRegistration()).waiting), null);
  } finally { await h.close(); }
});

test("update and reconnect never replay an uncertain write; explicit retry keeps its body", async () => {
  const h = await harness();
  let release;
  try {
    await installed(h.page); await h.page.reload(); await login(h.page);
    const bodies = [];
    const held = new Promise((resolve) => { release = resolve; });
    await h.context.route("**/api/v1/emergencies/", async (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      bodies.push(route.request().postDataJSON());
      if (bodies.length === 1) { await held; return route.abort("failed"); }
      return route.fulfill({ status: 400, json: { code: "validation_error", message: "Rechazo sintético confirmado." } });
    });
    await h.page.getByLabel(/Destino receptor/).selectOption("demo-hospital-id");
    await h.page.getByLabel(/Motivo de consulta/).fill("Motivo sintético pendiente");
    const requested = h.page.waitForRequest((r) => r.method() === "POST" && r.url().endsWith("/emergencies/"));
    await h.page.getByRole("button", { name: "Guardar emergencia" }).click();
    await requested;
    await update(h);
    assert.equal(bodies.length, 1);
    release();
    await h.page.getByRole("button", { name: /Reintentar envío/ }).waitFor();
    await h.context.setOffline(true);
    await h.page.getByText(/Sin conexión detectada/).waitFor();
    await h.context.setOffline(false);
    assert.equal(bodies.length, 1);
    await h.page.getByRole("button", { name: /Reintentar envío/ }).click();
    await h.page.getByText("Rechazo sintético confirmado.").waitFor();
    assert.equal(bodies.length, 2);
    assert.deepEqual(bodies[0], bodies[1]);
  } finally { release?.(); await h.close(); }
});

test("logout and offline navigation reveal no clinical cache or recovery token", async () => {
  const h = await harness();
  try {
    await installed(h.page); await h.page.reload(); await login(h.page);
    await h.page.getByRole("button", { name: /Cerrar sesión/ }).first().click();
    await h.page.getByRole("button", { name: "Iniciar sesión" }).waitFor();
    const storage = await h.page.evaluate(async () => ({
      caches: await caches.keys(), databases: await indexedDB.databases(),
      local: Object.keys(localStorage), session: Object.keys(sessionStorage),
    }));
    assert.deepEqual(storage, { caches: [], databases: [], local: [], session: [] });
    await h.context.setOffline(true);
    const response = await h.page.goto(`${h.base}/restablecer-cuenta#synthetic-private-token`);
    assert.equal(response.status(), 503);
    assert.equal(response.headers()["cache-control"], "no-store");
    await h.page.getByRole("heading", { name: "Sin conexión" }).waitFor();
    assert.doesNotMatch(await h.page.locator("body").innerText(), /synthetic-private-token|Caso en traslado|Hospital Central/);
    await h.context.setOffline(false);
    await h.page.goto(h.base);
    await h.page.getByRole("button", { name: "Iniciar sesión" }).waitFor();
  } finally { await h.close(); }
});

test("installation prompts only on user action and cancellation keeps the web session usable", async () => {
  const h = await harness();
  try {
    await h.page.getByText("Instalar AmbuSync", { exact: true }).waitFor();
    await h.page.getByText("Instalar AmbuSync", { exact: true }).click();
    await h.page.evaluate(() => {
      window.installCalls = 0;
      const event = new Event("beforeinstallprompt", { cancelable: true });
      event.prompt = async () => { window.installCalls++; };
      event.userChoice = Promise.resolve({ outcome: "dismissed" });
      window.dispatchEvent(event);
    });
    const install = h.page.getByRole("button", { name: "Instalar aplicación", exact: true });
    await install.waitFor();
    assert.equal(await h.page.evaluate(() => window.installCalls), 0);
    await install.click();
    assert.equal(await h.page.evaluate(() => window.installCalls), 1);
    assert.equal(await install.count(), 0);
    await login(h.page);
  } finally { await h.close(); }
});

for (const failure of ["unsupported", "registration"]) test(`optional PWA ${failure} never blocks login`, async () => {
  const h = await harness({
    swFail: failure === "registration",
    init: failure === "unsupported" ? () => { delete Navigator.prototype.serviceWorker; } : undefined,
  });
  try {
    await h.page.getByText("Instalar AmbuSync", { exact: true }).click();
    await h.page.getByText(failure === "registration" ? /No se pudo preparar la instalación/ : /Este navegador no permite preparar/).waitFor();
    await login(h.page);
  } finally { await h.close(); }
});

for (const width of [390, 768]) for (const groups of [["ambulance"], ["system_admin"]]) {
  test(`mobile ${width}px ${groups[0]} keeps controls and validation reachable without overflow`, async () => {
    const h = await harness({ groups, viewport: { width, height: 844 } });
    try {
      await h.page.getByText("Instalar AmbuSync", { exact: true }).click();
      await h.page.getByLabel("Usuario", { exact: true }).fill("synthetic");
      await h.page.getByLabel("Contraseña", { exact: true }).fill("synthetic-test-password");
      await h.page.getByRole("button", { name: "Iniciar sesión" }).click();
      if (groups[0] === "ambulance") {
        await h.page.getByLabel(/Motivo de consulta/).fill("Motivo sintético");
        await h.page.getByRole("button", { name: "Guardar emergencia" }).click();
        await h.page.locator("input:invalid,select:invalid,textarea:invalid").first().waitFor();
        assert.ok(await h.page.locator("input:invalid,select:invalid,textarea:invalid").first().evaluate((el) => !!el.validationMessage));
      } else {
        await h.page.getByRole("heading", { name: /Instituciones/ }).first().waitFor();
      }
      assert.ok(await h.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await h.page.screenshot({ path: path.join(shots, `k-${groups[0]}-${width}.png`), fullPage: true });
    } finally { await h.close(); }
  });
}
