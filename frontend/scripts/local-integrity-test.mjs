import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { chromium } from "playwright";
import { mockAuthenticatedApi } from "./mock-auth-api.mjs";

const BASE = process.env.BASE_URL || "http://127.0.0.1:5174";
let browser;
before(async () => { browser = await chromium.launch(); });
after(async () => { await browser?.close(); });

async function harness(groups = ["ambulance"]) {
  const context = await browser.newContext();
  await mockAuthenticatedApi(context);
  const now = Date.now() / 1000;
  const session = {
    expired: true,
    user: {
      id: "synthetic-person-a", username: "synthetic_ambulance", groups,
      institutions: [{ id: "synthetic-operator", name: "Hospital Operador Demo" }],
      ambulance: { id: "synthetic-unit-a", code: "SYN-01", institution_name: "Hospital Operador Demo" },
      session: { started_at: now, idle_expires_at: now + 1800, absolute_expires_at: now + 43200 },
    },
  };
  await context.route("**/api/v1/auth/me/", (route) => route.fulfill(session.expired
    ? { status: 401, json: { code: "session_expired", message: "Sesión expirada." } }
    : { json: session.user }));
  await context.route("**/api/v1/auth/login/", async (route) => {
    session.expired = false;
    await route.fulfill({ json: { ok: true } });
  });
  const page = await context.newPage();
  await page.addInitScript(() => {
    // This suite exercises HTTP/session behavior; no backend socket is required.
    window.WebSocket = class extends EventTarget {
      static CONNECTING = 0; static OPEN = 1; static CLOSING = 2; static CLOSED = 3;
      readyState = 0;
      constructor(url) { super(); this.url = url; }
      close() { this.readyState = 3; }
    };
  });
  async function login() {
    await page.getByLabel("Usuario", { exact: true }).fill("synthetic_ambulance");
    await page.getByLabel("Contraseña", { exact: true }).fill("synthetic-test-password");
    await page.getByRole("button", { name: "Iniciar sesión" }).click();
    await page.getByRole("heading", { name: "synthetic_ambulance" }).waitFor();
  }
  await page.goto(BASE);
  await login();
  return { context, page, session, login };
}

function createdEmergency(body) {
  return {
    id: "4b26f962-9102-4ab9-b2de-88bb6b5794d0", operating_institution_id: "synthetic-operator",
    destination_id: body.destination_id, destination_name: "Hospital Central Demo",
    ambulance_id: "synthetic-unit-a", ambulance_code: "SYN-01",
    status: body.transfer_started ? "en_traslado" : "notificada",
    patient: { identity_unknown: true, alias: null, age_value: null, age_unit: null, recorded_sex: null },
    reason: body.reason, symptoms: body.symptoms, notes: body.notes, triage: body.triage ?? null,
    vital_measurements: [], created_at: "2026-11-12T12:00:00Z",
    transfer_declared_at: null, transfer_declared_by_id: null,
    arrived_at: null, arrived_by_id: null, arrival_reason: "",
    cancelled_at: null, cancelled_by_id: null, cancellation_reason: "",
    closed_at: null, closed_by_id: null, version: 1,
  };
}

async function fillDraft(page, reason = "Motivo sintético de prueba") {
  await page.getByLabel(/Destino receptor/).selectOption("demo-hospital-id");
  await page.getByLabel(/Motivo de consulta/).fill(reason);
  await page.getByLabel(/Frecuencia cardíaca/).fill("82");
}

async function expireFromPortal(page, session) {
  await page.getByRole("button", { name: "Episodios de la unidad", exact: true }).click();
  session.expired = true;
  await page.route("**/api/v1/emergencies/**", (route) => route.fulfill({ status: 401, json: { code: "session_expired", message: "Sesión expirada." } }));
  await page.getByRole("button", { name: "Actualizar", exact: true }).evaluate((button) => button.click());
  await page.getByRole("button", { name: "Iniciar sesión" }).waitFor();
  await page.unroute("**/api/v1/emergencies/**");
}

test("lost create response reuses the complete operation body, including capture time", async () => {
  const { context, page } = await harness();
  try {
    const bodies = [];
    await context.route("**/api/v1/emergencies/", async (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      const body = route.request().postDataJSON();
      bodies.push(body);
      if (bodies.length === 1) return route.abort("failed");
      await route.fulfill({ status: 200, json: createdEmergency(body) });
    });
    await fillDraft(page);
    await Promise.all([
      page.waitForEvent("requestfailed", (request) => request.method() === "POST" && request.url().endsWith("/api/v1/emergencies/")),
      page.getByRole("button", { name: "Guardar emergencia" }).click(),
    ]);
    const retry = page.getByRole("button", { name: /Guardar emergencia|Reintentar envío/ });
    await retry.click();
    await page.getByText(/^Guardado:/).waitFor();
    assert.equal(bodies.length, 2);
    assert.deepEqual(bodies[1], bodies[0], "a retry must preserve operation_id and measured_at");
    assert.equal(await page.getByLabel(/Motivo de consulta/).inputValue(), "");
  } finally { await context.close(); }
});

test("a confirmed validation rejection allows correction and a new operation", async () => {
  const { context, page } = await harness();
  try {
    const bodies = [];
    await context.route("**/api/v1/emergencies/", async (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      const body = route.request().postDataJSON();
      bodies.push(body);
      if (bodies.length === 1) return route.fulfill({ status: 400, json: { code: "validation_error", message: "Revisa el motivo." } });
      return route.fulfill({ status: 201, json: createdEmergency(body) });
    });
    await fillDraft(page);
    await Promise.all([
      page.waitForResponse((response) => response.request().method() === "POST" && response.status() === 400),
      page.getByRole("button", { name: "Guardar emergencia" }).click(),
    ]);
    await page.getByLabel(/Motivo de consulta/).fill("Motivo sintético corregido");
    await page.getByRole("button", { name: "Guardar emergencia" }).click();
    await page.getByText(/^Guardado:/).waitFor();
    assert.notEqual(bodies[0].operation_id, bodies[1].operation_id);
    assert.equal(bodies[1].reason, "Motivo sintético corregido");
  } finally { await context.close(); }
});

for (const failure of ["invalid-json", "incomplete-json", "server-error"]) {
  test(`${failure} keeps creation uncertain and preserves the request for explicit retry`, async () => {
    const { context, page } = await harness();
    try {
      const bodies = [];
      await context.route("**/api/v1/emergencies/", async (route) => {
        if (route.request().method() !== "POST") return route.fallback();
        const body = route.request().postDataJSON();
        bodies.push(body);
        if (bodies.length > 1) return route.fulfill({ status: 200, json: createdEmergency(body) });
        if (failure === "invalid-json") return route.fulfill({ status: 201, contentType: "application/json", body: "{" });
        if (failure === "incomplete-json") return route.fulfill({ status: 201, json: {} });
        return route.fulfill({ status: 503, json: { code: "unavailable", message: "Indisponible." } });
      });
      await fillDraft(page);
      await page.getByRole("button", { name: "Guardar emergencia" }).click();
      await page.getByRole("button", { name: "Reintentar envío" }).waitFor();
      assert.equal(await page.getByLabel(/Motivo de consulta/).isDisabled(), true);
      assert.equal(await page.getByText(/^Guardado:/).count(), 0);
      assert.equal(bodies.length, 1, "no automatic mutation retry");
      await page.getByRole("button", { name: "Reintentar envío" }).click();
      await page.getByText(/^Guardado:/).waitFor();
      assert.deepEqual(bodies[1], bodies[0]);
    } finally { await context.close(); }
  });
}

test("a new creation after confirmed success receives a different operation ID", async () => {
  const { context, page } = await harness();
  try {
    const bodies = [];
    await context.route("**/api/v1/emergencies/", async (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      const body = route.request().postDataJSON();
      bodies.push(body);
      return route.fulfill({ status: 201, json: createdEmergency(body) });
    });
    await fillDraft(page);
    await page.getByRole("button", { name: "Guardar emergencia" }).click();
    await page.getByText(/^Guardado:/).waitFor();
    await fillDraft(page, "Otro episodio sintético");
    await page.getByRole("button", { name: "Guardar emergencia" }).click();
    await page.waitForFunction(() => document.querySelector("textarea")?.value === "");
    assert.equal(bodies.length, 2);
    assert.notEqual(bodies[0].operation_id, bodies[1].operation_id);
  } finally { await context.close(); }
});

for (const scenario of [
  { action: "transfer-start", role: "ambulance", initial: "notificada", next: "en_traslado", button: "Iniciar traslado" },
  { action: "cancel", role: "ambulance", initial: "en_traslado", next: "cancelada", button: "Cancelar episodio" },
  { action: "arrival", role: "urgencias", initial: "en_traslado", next: "llegado", button: "Marcar como llegado a Urgencias" },
  { action: "close", role: "urgencias", initial: "llegado", next: "cerrada", button: "Cerrar episodio" },
]) {
  test(`${scenario.action} retries the original operation even after a list refresh advances its version`, async () => {
    const { context, page } = await harness([scenario.role]);
    try {
      const emergency = {
        ...createdEmergency({ destination_id: "demo-hospital-id", reason: "Episodio sintético", symptoms: [], notes: "" }),
        status: scenario.initial,
      };
      const bodies = [];
      await context.route("**/api/v1/emergencies/**", async (route) => {
        const { pathname } = new URL(route.request().url());
        if (route.request().method() === "GET") {
          return route.fulfill({ json: { count: 1, next: null, previous: null, results: [emergency] } });
        }
        if (!pathname.endsWith(`/${scenario.action}/`)) return route.fallback();
        bodies.push(route.request().postDataJSON());
        if (bodies.length === 1) {
          emergency.status = scenario.next;
          emergency.version = 2;
          return route.abort("failed");
        }
        return route.fulfill({ json: emergency });
      });
      if (scenario.role === "ambulance") await page.getByRole("button", { name: "Episodios de la unidad", exact: true }).click();
      else await page.getByRole("button", { name: "Urgencias", exact: true }).click();
      await page.getByRole("button", { name: "Actualizar", exact: true }).click();
      if (scenario.role === "urgencias") await page.getByRole("button", { name: /Episodio sintético/ }).click();
      page.on("dialog", (dialog) => dialog.accept("Motivo sintético de cancelación"));
      await page.getByRole("button", { name: scenario.button, exact: true }).click();
      const retry = page.getByRole("button", { name: "Reintentar operación" });
      await retry.waitFor();
      // Close the details first, then ask the authoritative list for the new version.
      if (scenario.role === "urgencias") await page.getByRole("button", { name: "Cerrar", exact: true }).click();
      await page.getByRole("button", { name: "Actualizar", exact: true }).click();
      await retry.click();
      await page.getByText("Operación confirmada en el servidor.", { exact: true }).waitFor();
      assert.equal(bodies.length, 2);
      assert.deepEqual(bodies[1], bodies[0]);
      assert.equal(bodies[1].expected_version, 1);
      if (scenario.action === "cancel") assert.equal(bodies[1].reason, "Motivo sintético de cancelación");
    } finally { await context.close(); }
  });
}

test("same account and scope recover the draft after expiry without automatic submission", async () => {
  const { context, page, session, login } = await harness();
  try {
    let writes = 0;
    page.on("request", (request) => { if (request.method() === "POST" && request.url().includes("/api/v1/emergencies/")) writes += 1; });
    await fillDraft(page, "Borrador sintético conservado");
    await expireFromPortal(page, session);
    await login();
    assert.equal(await page.getByLabel(/Motivo de consulta/).inputValue(), "Borrador sintético conservado");
    assert.equal(await page.getByLabel(/Frecuencia cardíaca/).inputValue(), "82");
    assert.equal(writes, 0);
  } finally { await context.close(); }
});

for (const change of ["account", "unit", "institution", "permissions"]) {
  test(`${change} change discards the previous draft after reauthentication`, async () => {
    const { context, page, session, login } = await harness();
    try {
      await fillDraft(page, "Borrador privado del ámbito anterior");
      await expireFromPortal(page, session);
      if (change === "account") session.user.id = "synthetic-person-b";
      if (change === "unit") session.user.ambulance.id = "synthetic-unit-b";
      if (change === "institution") session.user.institutions = [{ id: "synthetic-operator-b", name: "Otro operador sintético" }];
      if (change === "permissions") session.user.groups = ["ambulance", "institution_admin"];
      await login();
      assert.equal(await page.getByLabel(/Motivo de consulta/).inputValue(), "");
      assert.equal(await page.getByLabel(/Frecuencia cardíaca/).inputValue(), "");
    } finally { await context.close(); }
  });
}

test("an uncertain create survives same-account reauthentication with its original body", async () => {
  const { context, page, session, login } = await harness();
  try {
    const bodies = [];
    await context.route("**/api/v1/emergencies/", async (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      const body = route.request().postDataJSON();
      bodies.push(body);
      if (bodies.length === 1) return route.abort("failed");
      return route.fulfill({ status: 200, json: createdEmergency(body) });
    });
    await fillDraft(page);
    await page.getByRole("button", { name: "Guardar emergencia" }).click();
    await page.getByRole("button", { name: "Reintentar envío" }).waitFor();
    await expireFromPortal(page, session);
    await login();
    assert.equal(bodies.length, 1);
    await page.getByRole("button", { name: "Reintentar envío" }).click();
    await page.getByText(/^Guardado:/).waitFor();
    assert.deepEqual(bodies[1], bodies[0]);
  } finally { await context.close(); }
});

test("explicit logout and page reload discard volatile drafts", async () => {
  const { context, page, session, login } = await harness();
  try {
    await fillDraft(page, "Borrador sintético que no debe persistirse");
    const stored = await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }));
    assert.ok(!stored.includes("Borrador sintético que no debe persistirse"));
    await context.route("**/api/v1/auth/logout/", async (route) => {
      session.expired = true;
      await route.fulfill({ status: 204, body: "" });
    });
    await page.getByRole("button", { name: "Cerrar sesión" }).click();
    await page.getByRole("button", { name: "Iniciar sesión" }).waitFor();
    await login();
    assert.equal(await page.getByLabel(/Motivo de consulta/).inputValue(), "");
    await fillDraft(page, "Borrador sintético perdido al recargar");
    await page.reload();
    await page.getByRole("heading", { name: "Nueva emergencia" }).waitFor();
    assert.equal(await page.getByLabel(/Motivo de consulta/).inputValue(), "");
  } finally { await context.close(); }
});

test("a delayed creation response cannot repopulate the portal after logout and another login", async () => {
  const { context, page, session, login } = await harness();
  let release;
  const waiting = new Promise((resolve) => { release = resolve; });
  let captured;
  const started = new Promise((resolve) => { captured = resolve; });
  try {
    await context.route("**/api/v1/auth/logout/", async (route) => {
      session.expired = true;
      await route.fulfill({ status: 204, body: "" });
    });
    await context.route("**/api/v1/emergencies/", async (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      const body = route.request().postDataJSON();
      captured();
      await waiting;
      await route.fulfill({ status: 201, json: createdEmergency(body) });
    });
    await fillDraft(page, "Contenido sintético de la cuenta anterior");
    await page.getByRole("button", { name: "Guardar emergencia" }).click();
    await started;
    await page.getByRole("button", { name: "Cerrar sesión" }).click();
    await page.getByRole("button", { name: "Iniciar sesión" }).waitFor();
    session.user.id = "synthetic-person-b";
    await login();
    const responseFinished = page.waitForResponse((response) => response.request().method() === "POST" && response.url().endsWith("/api/v1/emergencies/"));
    release();
    await (await responseFinished).finished();
    await page.getByLabel(/Motivo de consulta/).fill("Borrador sintético de la nueva cuenta");
    assert.equal(await page.getByText(/^Guardado:/).count(), 0);
    assert.equal(await page.getByText("Contenido sintético de la cuenta anterior", { exact: false }).count(), 0);
    assert.equal(await page.getByLabel(/Motivo de consulta/).inputValue(), "Borrador sintético de la nueva cuenta");
  } finally { release(); await context.close(); }
});

test("a conflict refreshes authoritative state and does not silently repeat the transition", async () => {
  const { context, page } = await harness();
  try {
    const emergency = { ...createdEmergency({ reason: "Conflicto sintético", symptoms: [], notes: "" }), status: "notificada" };
    let writes = 0;
    await context.route("**/api/v1/emergencies/**", async (route) => {
      if (route.request().method() === "GET") return route.fulfill({ json: { count: 1, next: null, previous: null, results: [emergency] } });
      writes += 1;
      emergency.status = "cancelada";
      emergency.version = 2;
      return route.fulfill({ status: 409, json: { code: "operation_conflict", message: "La versión cambió; revisa el episodio." } });
    });
    await page.getByRole("button", { name: "Episodios de la unidad", exact: true }).click();
    await page.getByRole("button", { name: "Actualizar", exact: true }).click();
    await page.getByRole("button", { name: "Iniciar traslado" }).click();
    await page.getByText("La versión cambió; revisa el episodio.", { exact: true }).waitFor();
    await page.getByText("Cancelada", { exact: true }).waitFor();
    assert.equal(writes, 1);
    assert.equal(await page.getByRole("button", { name: "Reintentar operación" }).count(), 0);
  } finally { await context.close(); }
});

test("refreshing the same authorized session does not switch away from administration", async () => {
  const { context, page } = await harness(["urgencias", "institution_admin"]);
  try {
    await page.clock.install();
    await page.getByRole("button", { name: "Administración", exact: true }).click();
    await page.getByLabel("Nombre de usuario", { exact: true }).fill("synthetic_pending_account");
    const refreshed = page.waitForResponse((response) => response.url().endsWith("/api/v1/auth/me/"));
    await page.clock.fastForward(31_000);
    await refreshed;
    await page.getByRole("heading", { name: "Cuentas de Hospital Central Demo" }).waitFor();
    assert.equal(await page.getByLabel("Nombre de usuario", { exact: true }).inputValue(), "synthetic_pending_account");
  } finally { await context.close(); }
});

async function refreshSession(page) {
  const now = await page.evaluate(() => Date.now());
  await page.clock.setSystemTime(now + 31_000);
  const response = page.waitForResponse((item) => item.url().endsWith("/api/v1/auth/me/"));
  await page.evaluate(() => window.dispatchEvent(new Event("pointerdown")));
  await (await response).finished();
}

async function flushUi(page) {
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

test("a response for another episode cannot confirm a pending transition", async () => {
  const { context, page } = await harness();
  try {
    const original = { ...createdEmergency({ reason: "Episodio sintético", symptoms: [], notes: "" }), status: "notificada" };
    await context.route("**/api/v1/emergencies/**", (route) => route.fulfill(route.request().method() === "GET"
      ? { json: { count: 1, next: null, previous: null, results: [original] } }
      : { json: { ...original, id: "different-episode", status: "notificada", version: 1 } }));
    await page.getByRole("button", { name: "Episodios de la unidad", exact: true }).click();
    await page.getByRole("button", { name: "Actualizar", exact: true }).click();
    const response = page.waitForResponse((item) => item.request().method() === "POST");
    await page.getByRole("button", { name: "Iniciar traslado" }).click();
    await (await response).finished();
    await flushUi(page);
    assert.equal(await page.getByRole("button", { name: "Reintentar operación" }).count(), 1);
    assert.equal(await page.getByText("Inicio de traslado registrado.", { exact: true }).count(), 0);
  } finally { await context.close(); }
});

for (const status of [400, 409]) {
  test(`an uninterpretable HTTP ${status} retains the uncertain creation`, async () => {
    const { context, page } = await harness();
    try {
      await context.route("**/api/v1/emergencies/", (route) => route.request().method() === "POST"
        ? route.fulfill({ status, contentType: "application/json", body: "{" }) : route.fallback());
      await fillDraft(page);
      const response = page.waitForResponse((item) => item.request().method() === "POST");
      await page.getByRole("button", { name: "Guardar emergencia" }).click();
      await (await response).finished();
      await flushUi(page);
      assert.equal(await page.getByRole("button", { name: "Reintentar envío" }).count(), 1);
      assert.equal(await page.getByLabel(/Motivo de consulta/).isDisabled(), true);
    } finally { await context.close(); }
  });
}

test("changing scope during a creation releases the old scope's busy controls", async () => {
  const { context, page, session } = await harness();
  let release;
  const waiting = new Promise((resolve) => { release = resolve; });
  let started;
  const received = new Promise((resolve) => { started = resolve; });
  try {
    await page.clock.install();
    await context.route("**/api/v1/emergencies/", async (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      const body = route.request().postDataJSON();
      started();
      await waiting;
      await route.fulfill({ status: 201, json: createdEmergency(body) });
    });
    await fillDraft(page);
    await page.getByRole("button", { name: "Guardar emergencia" }).click();
    await received;
    session.user.ambulance = { ...session.user.ambulance, id: "synthetic-unit-b", code: "SYN-02" };
    await refreshSession(page);
    await page.getByText("SYN-02", { exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: /Guardar emergencia|Guardando/ }).isEnabled(), true);
    assert.equal(await page.getByLabel(/Motivo de consulta/).inputValue(), "");
    release();
    await flushUi(page);
    assert.equal(await page.getByText(/^Guardado:/).count(), 0);
  } finally { release(); await context.close(); }
});

test("a delayed destination response cannot replace the newly authorized scope's options", async () => {
  const { context, page, session } = await harness();
  let release;
  const waiting = new Promise((resolve) => { release = resolve; });
  let started;
  const received = new Promise((resolve) => { started = resolve; });
  let calls = 0;
  try {
    await page.clock.install();
    await context.route("**/api/v1/institutions/destinations/", async (route) => {
      const requestNumber = ++calls;
      if (requestNumber === 1) { started(); await waiting; }
      await route.fulfill({ json: [{ id: requestNumber === 1 ? "old-destination" : "new-destination", name: requestNumber === 1 ? "Destino anterior" : "Destino actual" }] });
    });
    // First request belongs to A, second to the newly bound unit B.
    await refreshSession(page);
    await received;
    session.user.ambulance = { ...session.user.ambulance, id: "synthetic-unit-b", code: "SYN-02" };
    await refreshSession(page);
    await page.getByRole("option", { name: "Destino actual", exact: true }).waitFor({ state: "attached" });
    const oldFinished = page.waitForResponse((response) => response.url().endsWith("/institutions/destinations/"));
    release();
    await (await oldFinished).finished();
    await flushUi(page);
    assert.equal(await page.getByRole("option", { name: "Destino actual", exact: true }).count(), 1);
    assert.equal(await page.getByRole("option", { name: "Destino anterior", exact: true }).count(), 0);
  } finally { release(); await context.close(); }
});

test("two synchronous form submissions cannot dispatch concurrent creations", async () => {
  const { context, page } = await harness();
  let release;
  const waiting = new Promise((resolve) => { release = resolve; });
  let started;
  const received = new Promise((resolve) => { started = resolve; });
  let writes = 0;
  try {
    await context.route("**/api/v1/emergencies/", async (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      writes += 1;
      const body = route.request().postDataJSON();
      started();
      await waiting;
      await route.fulfill({ status: 201, json: createdEmergency(body) });
    });
    await fillDraft(page);
    await page.locator("form").evaluate((form) => { form.requestSubmit(); form.requestSubmit(); });
    await received;
    await flushUi(page);
    assert.equal(writes, 1);
    release();
    await page.getByText(/^Guardado:/).waitFor();
    assert.equal(writes, 1);
  } finally { release(); await context.close(); }
});

test("a defined 403 rejection retains editable input but does not retry or announce success", async () => {
  const { context, page } = await harness();
  try {
    let writes = 0;
    await context.route("**/api/v1/emergencies/", (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      writes += 1;
      return route.fulfill({ status: 403, json: { code: "permission_denied", message: "Operación no autorizada." } });
    });
    await fillDraft(page);
    await page.getByRole("button", { name: "Guardar emergencia" }).click();
    await page.getByText("Operación no autorizada.", { exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: "Reintentar envío" }).count(), 0);
    assert.equal(await page.getByText(/^Guardado:/).count(), 0);
    assert.equal(await page.getByLabel(/Motivo de consulta/).isEnabled(), true);
    assert.equal(writes, 1);
  } finally { await context.close(); }
});

test("changing scope during a transition releases controls without applying its late response", async () => {
  const { context, page, session } = await harness();
  let release;
  const waiting = new Promise((resolve) => { release = resolve; });
  let started;
  const received = new Promise((resolve) => { started = resolve; });
  const emergency = { ...createdEmergency({ reason: "Episodio sintético", symptoms: [], notes: "" }), status: "notificada" };
  try {
    await page.clock.install();
    await context.route("**/api/v1/emergencies/**", async (route) => {
      if (route.request().method() === "GET") return route.fulfill({ json: { count: 1, next: null, previous: null, results: [emergency] } });
      started();
      await waiting;
      await route.fulfill({ json: { ...emergency, status: "en_traslado", version: 2 } });
    });
    await page.getByRole("button", { name: "Episodios de la unidad", exact: true }).click();
    await page.getByRole("button", { name: "Actualizar", exact: true }).click();
    await page.getByRole("button", { name: "Iniciar traslado" }).click();
    await received;
    session.user.ambulance = { ...session.user.ambulance, id: "synthetic-unit-b", code: "SYN-02" };
    await refreshSession(page);
    await page.getByText("SYN-02", { exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: "Iniciar traslado" }).isEnabled(), true);
    const response = page.waitForResponse((item) => item.request().method() === "POST");
    release();
    await (await response).finished();
    await flushUi(page);
    assert.equal(await page.getByText("Inicio de traslado registrado.", { exact: true }).count(), 0);
    assert.equal(await page.getByRole("button", { name: "Iniciar traslado" }).isEnabled(), true);
  } finally { release(); await context.close(); }
});

test("a write waiting for CSRF cannot be dispatched under a different logged-in account", async () => {
  const { context, page, session, login } = await harness();
  let release;
  const waiting = new Promise((resolve) => { release = resolve; });
  let started;
  const received = new Promise((resolve) => { started = resolve; });
  let csrfCalls = 0;
  let writes = 0;
  try {
    // Reload with a valid cookie/session so the new module has not cached CSRF yet.
    await page.reload();
    await page.getByRole("heading", { name: "Nueva emergencia" }).waitFor();
    await context.route("**/api/v1/auth/csrf/", async (route) => {
      if (++csrfCalls === 1) { started(); await waiting; }
      await route.fulfill({ json: { csrf_token: "synthetic-csrf" } });
    });
    await context.route("**/api/v1/auth/logout/", async (route) => {
      session.expired = true;
      await route.fulfill({ status: 204, body: "" });
    });
    await context.route("**/api/v1/emergencies/", async (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      writes += 1;
      await route.fulfill({ status: 201, json: createdEmergency(route.request().postDataJSON()) });
    });
    await fillDraft(page, "No debe enviarse con otra identidad");
    await page.getByRole("button", { name: "Guardar emergencia" }).click();
    await received;
    await page.getByRole("button", { name: "Cerrar sesión" }).click();
    await page.getByRole("button", { name: "Iniciar sesión" }).waitFor();
    session.user.id = "synthetic-person-b";
    await login();
    const csrfFinished = page.waitForResponse((item) => item.url().endsWith("/auth/csrf/"));
    release();
    await (await csrfFinished).finished();
    await flushUi(page);
    assert.equal(writes, 0, "old account's payload must never be sent with a new account's cookie");
  } finally { release(); await context.close(); }
});

test("a later rejection does not prove that an earlier uncertain creation was never saved", async () => {
  const { context, page } = await harness();
  try {
    const bodies = [];
    await context.route("**/api/v1/emergencies/", async (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      const body = route.request().postDataJSON();
      bodies.push(body);
      if (bodies.length === 1) return route.abort("failed");
      if (bodies.length === 2) return route.fulfill({ status: 429, json: { code: "throttled", message: "Espera antes de reintentar." } });
      return route.fulfill({ status: 200, json: createdEmergency(body) });
    });
    await fillDraft(page);
    await page.getByRole("button", { name: "Guardar emergencia" }).click();
    await page.getByRole("button", { name: "Reintentar envío" }).click();
    await page.getByText(/Demasiados intentos de acceso/).waitFor();
    assert.equal(await page.getByRole("button", { name: "Reintentar envío" }).count(), 1);
    await page.getByRole("button", { name: "Reintentar envío" }).click();
    await page.getByText(/^Guardado:/).waitFor();
    assert.equal(bodies.length, 3);
    assert.deepEqual(bodies[1], bodies[0]);
    assert.deepEqual(bodies[2], bodies[0]);
  } finally { await context.close(); }
});
