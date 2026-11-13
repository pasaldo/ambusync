import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { chromium } from "playwright";
import { mockAuthenticatedApi } from "./mock-auth-api.mjs";

const BASE = process.env.BASE_URL || "http://127.0.0.1:5174";
let browser;
before(async () => { browser = await chromium.launch(); });
after(async () => { await browser.close(); });

function emergency(id, alias, triage, date, status = "en_traslado") {
  return { id: `10000000-0000-4000-8000-${String(id).padStart(12, "0")}`, patient: { identity_unknown: false, alias, age_value: null, age_unit: null, recorded_sex: null }, status, triage, created_at: date, reason: "Prueba sintética de revisión", notes: "", symptoms: [], vital_measurements: [], destination_id: "demo-hospital-id", destination_name: "Hospital Central Demo", ambulance_code: "SYN-01", version: 1 };
}

async function harness({ groups = ["urgencias"], ambulance = null, rows = [] } = {}) {
  const context = await browser.newContext();
  await mockAuthenticatedApi(context, { groups });
  const now = Date.now() / 1000;
  const state = { writes: 0, user: { id: "synthetic-review-user", username: "synthetic_review", groups, institutions: [{ id: "demo-hospital-id", name: "Hospital Central Demo" }], ambulance, session: { started_at: now, idle_expires_at: now + 1800, absolute_expires_at: now + 43200 } }, rows };
  await context.route("**/api/v1/auth/me/", (route) => route.fulfill({ json: state.user }));
  await context.route("**/api/v1/emergencies/**", (route) => {
    if (route.request().method() !== "GET") { state.writes += 1; return route.fulfill({ status: 403, json: { code: "forbidden", message: "Solo lectura sintética." } }); }
    const page = Number(new URL(route.request().url()).searchParams.get("page") || 1);
    return route.fulfill({ json: { count: state.rows.length, results: page === 1 ? state.rows.slice(0, 2) : state.rows.slice(2), next: page === 1 && state.rows.length > 2 ? `${BASE}/api/v1/emergencies/?page=2` : null, previous: null } });
  });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  await page.addInitScript(() => {
    window.__reviewIntervals = new Map();
    const original = window.setInterval.bind(window);
    window.setInterval = (callback, delay, ...args) => { window.__reviewIntervals.set(delay, callback); return original(callback, delay, ...args); };
    window.__runReviewInterval = (delay) => window.__reviewIntervals.get(delay)?.();
    window.WebSocket = class extends EventTarget {
      static CONNECTING = 0; static OPEN = 1; static CLOSING = 2; static CLOSED = 3;
      readyState = 0;
      constructor(url) { super(); this.url = url; window.__reviewSocket = this; }
      close() { this.readyState = 3; this.dispatchEvent(new Event("close")); }
    };
    window.__openReviewSocket = () => { window.__reviewSocket.readyState = 1; window.__reviewSocket.dispatchEvent(new Event("open")); };
    window.__reviewNotify = (event) => window.__reviewSocket.dispatchEvent(new MessageEvent("message", { data: JSON.stringify(event) }));
  });
  await page.goto(`${BASE}/local`);
  await page.getByRole("heading", { name: "synthetic_review" }).waitFor();
  return { context, page, state };
}

test("account without ambulance shows actionable notice and cannot dispatch creation; reassignment revalidates without reload", async () => {
  const { context, page, state } = await harness({ groups: ["ambulance", "urgencias"] });
  try {
    const notice = page.getByRole("status", { name: "Estado de asignación de ambulancia" });
    await notice.filter({ hasText: "Sin unidad asignada" }).waitFor();
    assert.equal(await page.getByRole("button", { name: "Guardar emergencia", exact: true }).isDisabled(), true);
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    if (process.env.REVIEW_ACCOUNT_SCREENSHOT) await page.screenshot({ path: process.env.REVIEW_ACCOUNT_SCREENSHOT, fullPage: true });
    state.user.ambulance = { id: "synthetic-unit-a", code: "SYN-REVIEW", institution_name: "Operadora sintética" };
    await page.evaluate(() => window.__runReviewInterval(30000));
    await notice.waitFor({ state: "hidden" });
    await page.waitForFunction(() => [...document.querySelectorAll("button")].some((item) => item.textContent.includes("Guardar emergencia") && !item.disabled));
    state.user.ambulance = null;
    await page.evaluate(() => window.__runReviewInterval(30000));
    await notice.waitFor();
    await page.locator("form").evaluate((form) => form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    assert.equal(state.writes, 0);
    await page.getByRole("button", { name: "Urgencias", exact: true }).click();
    await page.getByRole("heading", { name: "Episodios entrantes" }).waitFor();
  } finally { await context.close(); }
});

test("all fetched pages use triage/oldest order, unclassified separate; WS and fallback reclassify without reload", async () => {
  const rows = [emergency(1, "C2 nuevo", "C2", "2026-11-13T12:00:00Z", "notificada"), emergency(2, "C5", "C5", "2026-01-01T12:00:00Z"), emergency(3, "C1", "C1", "2026-11-13T13:00:00Z", "llegado"), emergency(4, "C2 antiguo", "C2", "2026-11-12T12:00:00Z"), emergency(5, "Pendiente", null, "2026-11-11T12:00:00Z", "notificada")];
  const { context, page } = await harness({ rows });
  try {
    const classified = page.getByRole("region", { name: "Clasificados por triaje", exact: true });
    const unclassified = page.getByRole("region", { name: "Sin clasificar: pendientes de revisión", exact: true });
    await classified.waitFor();
    const names = (region) => region.locator("button.block.w-full.rounded-xl > span:first-child > strong").allTextContents();
    assert.deepEqual(await names(classified), ["C1", "C2 antiguo", "C2 nuevo", "C5"]);
    assert.deepEqual(await names(unclassified), ["Pendiente"]);
    assert.equal(await page.getByText("Actualización periódica local; sin WebSocket.", { exact: true }).count(), 0);
    await page.evaluate(() => window.__openReviewSocket());
    await page.getByText("Avisos por WebSocket; conciliación HTTP de respaldo cada 60 s.", { exact: true }).waitFor();
    rows[2].triage = null; rows[2].version += 1;
    await page.evaluate((id) => window.__reviewNotify({ event_id: "20000000-0000-4000-8000-000000000001", emergency_id: id, type: "emergency.updated", version: 2 }), rows[2].id);
    await unclassified.getByRole("button", { name: /C1/ }).waitFor();
    assert.deepEqual(await names(classified), ["C2 antiguo", "C2 nuevo", "C5"]);
    assert.deepEqual(await names(unclassified), ["Pendiente", "C1"]);
    rows[1].triage = "C1"; rows[1].version += 1;
    await page.evaluate(() => { window.__reviewSocket.close(); window.__runReviewInterval(15000); });
    await page.getByText("WebSocket no conectado; consulta HTTP de respaldo cada 15 s.", { exact: true }).waitFor();
    await page.waitForFunction(() => document.querySelector('[aria-label="Clasificados por triaje"] button strong')?.textContent === "C5");
    assert.deepEqual(await names(classified), ["C5", "C2 antiguo", "C2 nuevo"]);
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    if (process.env.REVIEW_QUEUE_SCREENSHOT) await page.screenshot({ path: process.env.REVIEW_QUEUE_SCREENSHOT, fullPage: true });
  } finally { await context.close(); }
});

test("history identifies replacement value and ID, including a missing replacement fallback", async () => {
  const row = emergency(6, "Medición sintética", "C2", "2026-11-13T12:00:00Z");
  const dates = { measured_at: "2026-11-13T12:00:00Z", recorded_at: "2026-11-13T12:00:01Z", recorded_by_id: "synthetic-author" };
  row.vital_measurements = [{ ...dates, id: "44", kind: "heart_rate", value: 65, unit: "lpm", is_current: false, rectified_by_id: "45" }, { ...dates, id: "45", kind: "heart_rate", value: 75, unit: "lpm", is_current: true, rectifies_id: "44", rectification_reason: "Error sintético de digitación" }];
  const { context, page } = await harness({ groups: ["ambulance"], ambulance: { id: "synthetic-unit-a", code: "SYN-REVIEW" }, rows: [row] });
  try {
    await page.getByRole("button", { name: "Episodios de la unidad", exact: true }).click();
    await page.getByRole("button", { name: "Actualizar antecedentes y mediciones" }).click();
    await page.getByText("Rectificada: reemplazo de 75 lpm (medición #45).", { exact: true }).waitFor();
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    if (process.env.REVIEW_HISTORY_SCREENSHOT) await page.screenshot({ path: process.env.REVIEW_HISTORY_SCREENSHOT, fullPage: true });
    assert.equal(await page.getByRole("button", { name: "Rectificar medición 44", exact: true }).count(), 0);
    assert.equal(await page.getByText("Rectificada → 45", { exact: true }).count(), 0);
    row.vital_measurements.pop(); row.version += 1;
    await page.getByRole("button", { name: "Actualizar", exact: true }).click();
    await page.getByText("Rectificada: reemplazo en medición #45; valor no disponible en este historial.", { exact: true }).waitFor();
  } finally { await context.close(); }
});
