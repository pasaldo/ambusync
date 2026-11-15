import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { chromium } from "playwright";
import { mockAuthenticatedApi } from "./mock-auth-api.mjs";

let browser;
before(async () => { browser = await chromium.launch(); });
after(async () => { await browser.close(); });
async function harness(holdFirst = false, groups = ["ambulance"], virtualClock = false, notified = false) {
  const context = await browser.newContext();
  await mockAuthenticatedApi(context, { groups });
  if (notified) await context.route("**/api/v1/emergencies/?*", (route) => route.fulfill({ json: {
    results: [{ id: "synthetic-notified-gps", version: 1, status: "notificada",
      patient: { identity_unknown: true, alias: "", age_value: null, age_unit: "", recorded_sex: null },
      reason: "Notificación sintética pendiente de traslado", destination_name: "Destino sintético", ambulance_code: "SYN-01",
      created_at: new Date().toISOString(), symptoms: [], vital_measurements: [], patient_context_corrections: [], notes: "",
    }], next: null, count: 1,
  } }));
  await context.route("**/api/v1/emergencies/", (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    const body = route.request().postDataJSON();
    return route.fulfill({ status: 201, json: {
      id: "synthetic-created-gps", version: 1, status: "notificada",
      patient: { identity_unknown: true, alias: "", age_value: null, age_unit: "", recorded_sex: null },
      reason: body.reason, destination_name: "Destino sintético", ambulance_code: "SYN-01",
      created_at: new Date().toISOString(), symptoms: [], vital_measurements: [], patient_context_corrections: [], notes: "",
    } });
  });
  const posts = [];
  const state = { fail: false, latest: null, status: notified ? "notificada" : "en_traslado", releaseOld: null };
  const held = new Promise((resolve) => { state.releaseOld = resolve; });
  let firstGet = true;
  await context.route("**/api/v1/emergencies/*/positions/", async (route) => {
    if (route.request().method() === "GET") {
      const body = { latest: state.latest, last_received: state.latest, target: { latitude: 0, longitude: 1 }, server_time: new Date().toISOString(), status: state.status };
      if (firstGet && holdFirst) { firstGet = false; await held; }
      return route.fulfill({ json: body });
    }
    const body = route.request().postDataJSON(); posts.push(body);
    assert.equal(route.request().headers()["x-ambusync-interaction"], undefined, "GPS must not renew human inactivity");
    if (state.fail) return route.abort("failed");
    state.latest = { ...body, id: "synthetic-position", sequence: 1, clock_consistent: true, received_at: new Date().toISOString() };
    return route.fulfill({ status: 201, json: { position: state.latest } });
  });
  const page = await context.newPage(); page.setDefaultTimeout(10000);
  if (virtualClock) {
    await page.clock.install();
    await page.addInitScript(() => { window.WebSocket = class extends EventTarget { readyState = 0; close() {} }; });
  }
  await page.addInitScript(() => {
    window.gpsWatchers = []; window.gpsCleared = [];
    Object.defineProperty(navigator, "geolocation", { configurable: true, value: {
      watchPosition(success, failure) { window.gpsWatchers.push({ success, failure }); return window.gpsWatchers.length; },
      clearWatch(id) { window.gpsCleared.push(id); },
      getCurrentPosition(success, failure) { window.gpsWatchers.push({ success, failure }); },
    } });
  });
  await page.goto(process.env.BASE_URL || "http://127.0.0.1:5174/");
  await page.getByLabel("Usuario", { exact: true }).fill("demo_ambulancia");
  await page.getByLabel("Contraseña", { exact: true }).fill("synthetic-password");
  await page.getByRole("button", { name: "Iniciar sesión", exact: true }).click();
  if (groups.includes("ambulance")) await page.getByRole("button", { name: "Episodios de la unidad", exact: true }).click();
  return { page, context, state, posts };
}

test("GPS asks explicitly, reports distance and clears callbacks after stop", async () => {
  const h = await harness();
  try {
    const start = h.page.getByRole("button", { name: /Compartir ubicación|Iniciar GPS/ }).first();
    const startBox = await start.boundingBox();
    const milestoneBox = await h.page.getByText("Lectura y preparación de Urgencias", { exact: true }).first().boundingBox();
    assert.ok(startBox && milestoneBox && startBox.y < milestoneBox.y, "GPS action should be discoverable before the milestone history");
    await start.click();
    await h.page.evaluate(() => window.gpsWatchers.at(-1).success({ coords: { latitude: 0, longitude: 0, accuracy: 8 }, timestamp: Date.now() }));
    await h.page.getByText(/111[,.]2 km/).first().waitFor();
    assert.equal(h.posts.length, 1);
    await h.page.getByRole("button", { name: "Pausar GPS", exact: true }).first().click();
    await h.page.evaluate(() => window.gpsWatchers.at(-1).success({ coords: { latitude: 1, longitude: 1, accuracy: 8 }, timestamp: Date.now()+20000 }));
    assert.equal(h.posts.length, 1);
    assert.ok(await h.page.evaluate(() => window.gpsCleared.length > 0));
    await h.page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await h.page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    if (process.env.GPS_SCREENSHOT) await h.page.screenshot({ path: process.env.GPS_SCREENSHOT, fullPage: true });
  } finally { await h.context.close(); }
});

test("uncertain position suspends GPS and explicit retry retains original body", async () => {
  const h = await harness(false, ["ambulance"], true);
  try {
    h.state.fail = true;
    await h.page.getByRole("button", { name: /Compartir ubicación|Iniciar GPS/ }).first().click();
    await h.page.evaluate(() => window.gpsWatchers.at(-1).success({ coords: { latitude: 0, longitude: 0, accuracy: 8 }, timestamp: Date.now() }));
    await h.page.getByText(/Posición sin confirmar/).first().waitFor();
    assert.equal(h.posts.length, 1);
    await h.page.clock.runFor(45000);
    assert.equal(h.posts.length, 1, "periodic acquisition must not auto-retry an uncertain write");
    assert.equal(await h.page.evaluate(() => window.gpsWatchers.length), 1, "no fresh read may start while the uncertain write is suspended");
    h.state.fail = false;
    await h.page.getByRole("button", { name: "Reintentar posición", exact: true }).first().click();
    await h.page.getByText(/111[,.]2 km/).first().waitFor();
    assert.equal(h.posts.length, 2);
    assert.deepEqual(h.posts[0], h.posts[1]);
  } finally { await h.context.close(); }
});

test("hiding the application clears GPS and returning does not resume automatically", async () => {
  const h = await harness();
  try {
    await h.page.getByRole("button", { name: /Compartir ubicación/ }).first().click();
    await h.page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
      document.dispatchEvent(new Event("visibilitychange"));
      window.gpsWatchers.at(-1).success({ coords: { latitude: 1, longitude: 1, accuracy: 8 }, timestamp: Date.now() });
      Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await h.page.getByText(/GPS pausado al ocultar/).first().waitFor();
    assert.equal(h.posts.length, 0);
    assert.equal(await h.page.getByRole("button", { name: "Pausar GPS", exact: true }).count(), 0);
    assert.ok(await h.page.evaluate(() => window.gpsCleared.length > 0));
  } finally { await h.context.close(); }
});

test("denied GPS stays optional and logout invalidates device callbacks", async () => {
  const h = await harness();
  try {
    await h.page.getByRole("button", { name: /Compartir ubicación/ }).first().click();
    await h.page.evaluate(() => window.gpsWatchers.at(-1).failure({ code: 1 }));
    await h.page.getByText(/Permiso de ubicación denegado/).first().waitFor();
    assert.equal(h.posts.length, 0);
    await h.page.getByRole("button", { name: /Compartir ubicación/ }).first().click();
    await h.page.getByRole("button", { name: "Cerrar sesión", exact: true }).click();
    await h.page.getByRole("button", { name: "Iniciar sesión", exact: true }).waitFor();
    await h.page.evaluate(() => window.gpsWatchers.at(-1).success({ coords: { latitude: 1, longitude: 1, accuracy: 8 }, timestamp: Date.now() }));
    assert.equal(h.posts.length, 0);
  } finally { await h.context.close(); }
});

test("late position GET cannot replace a newer confirmed sample with an older snapshot", async () => {
  const h = await harness(true);
  try {
    await h.page.getByRole("button", { name: /Compartir ubicación/ }).first().click();
    await h.page.evaluate(() => window.gpsWatchers.at(-1).success({ coords: { latitude: 0, longitude: 0, accuracy: 8 }, timestamp: Date.now() }));
    await h.page.getByText(/111[,.]2 km/).first().waitFor();
    const response = h.page.waitForResponse((r) => r.url().includes("/positions/") && r.request().method() === "GET");
    h.state.releaseOld(); await (await response).finished();
    await h.page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.equal(await h.page.getByText(/111[,.]2 km/).count(), 1);
  } finally { h.state.releaseOld(); await h.context.close(); }
});

test("first GPS capture is opt-in after confirmed creation and denial cannot block emergency", async () => {
  const h = await harness();
  try {
    await h.page.getByRole("button", { name: "Ambulancia", exact: true }).click();
    await h.page.getByLabel(/Destino receptor/).selectOption({ index: 1 });
    await h.page.getByLabel(/Motivo de consulta/).fill("Caso sintético sin señal GPS");
    await h.page.getByLabel("Compartir una primera posición GPS al enviar (opcional)", { exact: true }).check();
    await h.page.getByRole("button", { name: "Guardar emergencia", exact: true }).click();
    await h.page.getByText(/Guardado:/).waitFor();
    await h.page.evaluate(() => window.gpsWatchers.at(-1).failure({ code: 1 }));
    await h.page.getByText(/El episodio se registró sin GPS/).first().waitFor();
    assert.equal(h.posts.length, 0);
  } finally { await h.context.close(); }
});

test("hiding while emergency creation is pending invalidates initial GPS consent", async () => {
  const h = await harness(); let release;
  try {
    const held = new Promise((resolve) => { release = resolve; });
    await h.context.route("**/api/v1/emergencies/", async (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      await held; return route.fallback();
    });
    await h.page.getByRole("button", { name: "Ambulancia", exact: true }).click();
    await h.page.getByLabel(/Destino receptor/).selectOption({ index: 1 });
    await h.page.getByLabel(/Motivo de consulta/).fill("Caso sintético con ocultamiento");
    await h.page.getByLabel("Compartir una primera posición GPS al enviar (opcional)", { exact: true }).check();
    const request = h.page.waitForRequest((r) => r.url().endsWith("/api/v1/emergencies/") && r.method() === "POST");
    await h.page.getByRole("button", { name: "Guardar emergencia", exact: true }).click(); await request;
    await h.page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" }); document.dispatchEvent(new Event("visibilitychange"));
      Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" }); document.dispatchEvent(new Event("visibilitychange"));
    });
    release(); await h.page.getByText(/Guardado:/).waitFor();
    assert.equal(await h.page.evaluate(() => window.gpsWatchers.length), 0);
  } finally { release?.(); await h.context.close(); }
});

test("receiver wall-clock skew cannot make an old server position look fresh", async () => {
  const h = await harness();
  try {
    await h.page.evaluate(() => { const realNow = Date.now; Date.now = () => realNow()-120000; });
    const captured = new Date(Date.now()-120000).toISOString();
    await h.context.route("**/api/v1/emergencies/*/positions/", (route) => route.fulfill({ json: {
      latest: { id: "synthetic", sequence: 1, latitude: 0, longitude: 0, accuracy_m: 8, captured_at: captured, received_at: captured, clock_consistent: true },
      last_received: null, target: null, server_time: new Date().toISOString(), status: "en_traslado",
    } }));
    await h.page.getByRole("button", { name: "Ambulancia", exact: true }).click();
    await h.page.getByRole("button", { name: "Episodios de la unidad", exact: true }).click();
    await h.page.getByText(/Ubicación desactualizada/).first().waitFor();
  } finally { await h.context.close(); }
});

test("expired position read in Urgencias immediately clears the protected portal", async () => {
  const h = await harness(false, ["urgencias"]);
  try {
    await h.page.getByRole("button").filter({ hasText: "Caso en traslado" }).first().waitFor();
    await h.context.route("**/api/v1/emergencies/*/positions/", (route) => route.fulfill({ status: 401, json: { code: "not_authenticated", message: "Sesión expirada." } }));
    await h.context.route("**/api/v1/auth/me/", (route) => route.fulfill({ status: 401, json: { code: "not_authenticated", message: "Sesión expirada." } }));
    // Native click avoids an independent human-activity /me request masking the GPS 401.
    await h.page.getByRole("button").filter({ hasText: "Caso en traslado" }).first().evaluate((button) => button.click());
    await h.page.getByRole("button", { name: "Iniciar sesión", exact: true }).waitFor();
    assert.equal(await h.page.getByRole("dialog", { name: "Detalle de episodio" }).count(), 0);
  } finally { await h.context.close(); }
});

test("stationary device sends a new periodic capture within thirty seconds and pause cancels renewal", async () => {
  const h = await harness(false, ["ambulance"], true);
  try {
    await h.page.evaluate(() => {
      window.periodicGpsReads = 0;
      navigator.geolocation.getCurrentPosition = (success) => {
        window.periodicGpsReads++;
        success({ coords: { latitude: 0, longitude: 0, accuracy: 8 }, timestamp: Date.now() });
      };
    });
    await h.page.getByRole("button", { name: "Compartir ubicación", exact: true }).first().click();
    await h.page.evaluate(() => window.gpsWatchers.at(-1).success({ coords: { latitude: 0, longitude: 0, accuracy: 8 }, timestamp: Date.now() }));
    await h.page.getByText(/111[,.]2 km/).first().waitFor();
    const next = h.page.waitForResponse((r) => r.url().includes("/positions/") && r.request().method() === "POST");
    await h.page.clock.runFor(15000);
    await (await next).finished();
    assert.equal(h.posts.length, 2);
    assert.notEqual(h.posts[0].operation_id, h.posts[1].operation_id);
    assert.equal(h.posts[1].latitude, 0);
    const captureGap = Date.parse(h.posts[1].captured_at)-Date.parse(h.posts[0].captured_at);
    assert.ok(captureGap > 0 && captureGap <= 30000, "a fresh device capture should arrive within thirty seconds");
    await h.page.getByRole("button", { name: "Pausar GPS", exact: true }).first().click();
    await h.page.clock.runFor(45000);
    assert.equal(h.posts.length, 2);
    assert.equal(await h.page.evaluate(() => window.periodicGpsReads), 1);
  } finally { await h.context.close(); }
});

for (const reason of ["hidden", "arrival"]) test(`periodic renewal stops on ${reason} without a fresh device request`, async () => {
  const h = await harness(false, ["ambulance"], true);
  try {
    await h.page.getByRole("button", { name: "Compartir ubicación", exact: true }).first().click();
    if (reason === "hidden") {
      await h.page.evaluate(() => {
        Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
        document.dispatchEvent(new Event("visibilitychange"));
        Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
        document.dispatchEvent(new Event("visibilitychange"));
      });
      await h.page.getByText(/GPS pausado al ocultar/).first().waitFor();
    } else {
      h.state.status = "llegado";
      await h.page.clock.runFor(5000);
      await h.page.getByText(/Seguimiento detenido por estado/).first().waitFor();
    }
    await h.page.clock.runFor(45000);
    assert.equal(await h.page.evaluate(() => window.gpsWatchers.length), 1);
    assert.equal(h.posts.length, 0);
  } finally { await h.context.close(); }
});

test("notified first capture never starts periodic acquisition while its POST is pending", async () => {
  const h = await harness(false, ["ambulance"], true, true); let release;
  try {
    const held = new Promise((resolve) => { release = resolve; });
    await h.context.route("**/api/v1/emergencies/*/positions/", async (route) => {
      if (route.request().method() === "POST") await held;
      return route.fallback();
    });
    await h.page.getByRole("button", { name: "Compartir ubicación", exact: true }).first().click();
    const request = h.page.waitForRequest((r) => r.url().includes("/positions/") && r.method() === "POST");
    await h.page.evaluate(() => window.gpsWatchers.at(-1).success({ coords: { latitude: 0, longitude: 0, accuracy: 8 }, timestamp: Date.now() }));
    await request;
    await h.page.clock.runFor(45000);
    assert.equal(await h.page.evaluate(() => window.gpsWatchers.length), 1, "notified state allows one acquisition, not a periodic reader");
  } finally { release?.(); await h.context.close(); }
});
