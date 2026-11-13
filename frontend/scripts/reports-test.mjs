import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { chromium } from "playwright";
import { mockAuthenticatedApi } from "./mock-auth-api.mjs";

let browser;
before(async () => { browser = await chromium.launch(); });
after(async () => { await browser.close(); });
const BASE = process.env.BASE_URL || "http://127.0.0.1:5174";
function episode(index, status = "cerrada") {
  return { id: `10000000-0000-4000-8000-${String(index).padStart(12, "0")}`, version: 2, status,
    patient: { identity_unknown: true, alias: null, age_value: null, age_unit: null, recorded_sex: null },
    reason: `Episodio sintético H ${index}`, destination_id: "destination-h", destination_name: "Receptor sintético H",
    ambulance_id: "unit-h", ambulance_code: "SYN-H", created_at: "2026-11-13T12:00:00Z",
    arrived_at: "2026-11-13T12:30:00Z", symptoms: [], vital_measurements: [], patient_context_corrections: [], triage: "C2", notes: "" };
}
async function harness(groups = ["urgencias", "view_reports"], clock = false) {
  const context = await browser.newContext();
  await mockAuthenticatedApi(context, { groups });
  const now = Date.now() / 1000;
  const user = { id: "h-reader", username: "synthetic_h", groups, institutions: [{ id: "destination-h", name: "Receptor sintético H" }], ambulance: null,
    session: { started_at: now, idle_expires_at: now + 1800, absolute_expires_at: now + 43200 } };
  const state = { queries: [], live: [], hold: null, detailAlien: false, loggedOut: false };
  await context.route("**/api/v1/auth/me/", (route) => route.fulfill(state.loggedOut ? { status: 401, json: { code: "not_authenticated", message: "Se requiere sesión." } } : { json: user }));
  await context.route("**/api/v1/auth/logout/", (route) => { state.loggedOut = true; return route.fulfill({ status: 204, body: "" }); });
  await context.route("**/api/v1/emergencies/**", (route) => route.fulfill({ json: { count: state.live.length, next: null, results: state.live } }));
  await context.route("**/api/v1/reports/emergencies/**", async (route) => {
    const url = new URL(route.request().url()); state.queries.push(url.pathname + url.search);
    if (!url.pathname.endsWith("/emergencies/")) {
      const id = Number(url.pathname.split("/").at(-2).split("-").at(-1));
      return route.fulfill({ json: episode(state.detailAlien ? 999 : id) });
    }
    const data = { count: 27, next: url.searchParams.get("page") === "2" ? null : "next", previous: url.searchParams.get("page") === "2" ? "previous" : null,
      results: [episode(url.searchParams.get("page") === "2" ? 26 : 1)],
      summary: { total: 27, by_status: { cerrada: 27, cancelada: 0, notificada: 0, en_traslado: 0, llegado: 0 }, by_triage: { C1: 0, C2: 27, C3: 0, C4: 0, C5: 0, unclassified: 0 } },
      ambulances: [{ id: "unit-h", code: "SYN-H" }], timezone: "America/Santiago", date_basis: "created_at" };
    if (url.searchParams.get("status") === "cancelada") data.results = [episode(2)];
    if (state.hold) await state.hold(url);
    await route.fulfill({ json: data });
  });
  await context.route("**/api/v1/institutions/audit/**", (route) => route.fulfill({ json: { count: 1, next: null, previous: null, results: [{ id: "audit-h", actor_id: "actor-h", occurred_at: "2026-11-13T12:00:00Z", action: "account.created", object_type: "account", object_id: "synthetic-account", result: "success", correlation_id: "correlation-h" }] } }));
  const page = await context.newPage(); page.setDefaultTimeout(10000);
  if (clock) await page.clock.install();
  await page.addInitScript(() => { window.WebSocket = class extends EventTarget { readyState = 0; close() {} }; });
  await page.goto(`${BASE}/local`);
  await page.getByRole("heading", { name: "synthetic_h" }).waitFor();
  return { context, page, state, user };
}

test("operational urgencias has no clinical archive and retains all pending arrivals", async () => {
  const h = await harness(["urgencias"]);
  try {
    h.state.live = Array.from({ length: 26 }, (_, i) => episode(i + 1, "llegado"));
    await h.page.reload();
    assert.equal(await h.page.getByRole("button", { name: "Archivo de Urgencias", exact: true }).count(), 0);
    assert.equal(await h.page.getByRole("button", { name: "Histórico e informes", exact: true }).count(), 0);
    await h.page.getByText("Episodio sintético H 1", { exact: true }).waitFor();
    await h.page.getByText("Episodio sintético H 26", { exact: true }).waitFor();
  } finally { await h.context.close(); }
});

test("reports use server filters, pagination and a read-only historical detail", async () => {
  const h = await harness();
  try {
    await h.page.getByRole("button", { name: "Histórico e informes", exact: true }).click();
    await h.page.getByText("27 episodios", { exact: true }).waitFor();
    assert.ok(h.state.queries.length > 0 && h.state.queries.every((query) => new URL(query, BASE).searchParams.get("page") === "1"), "StrictMode may repeat the first read, but must not download later pages");
    await h.page.getByLabel("Desde (fecha de creación)", { exact: true }).fill("2026-11-01");
    await h.page.getByLabel("Estado del informe", { exact: true }).selectOption("cerrada");
    const filtered = h.page.waitForResponse((response) => response.url().includes("/reports/emergencies/") && response.url().includes("date_from=2026-11-01"));
    await h.page.getByRole("button", { name: "Aplicar filtros", exact: true }).click();
    await filtered;
    await h.page.getByRole("button", { name: "Página siguiente", exact: true }).click();
    await h.page.getByText("Episodio sintético H 26", { exact: true }).waitFor();
    assert.match(h.state.queries.at(-1), /page=2/);
    assert.match(h.state.queries.at(-1), /status=cerrada/);
    await h.page.getByRole("button", { name: /Ver episodio.*H 26/ }).click();
    await h.page.getByRole("heading", { name: "Detalle histórico", exact: true }).waitFor();
    assert.equal(await h.page.getByRole("button", { name: /Confirmar lectura|Registrar preparación|Cerrar episodio/ }).count(), 0);
    await h.page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await h.page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    if (process.env.REPORTS_SCREENSHOT) await h.page.screenshot({ path: process.env.REPORTS_SCREENSHOT, fullPage: true });
  } finally { await h.context.close(); }
});

test("non-clinical institutional administrator sees only administrative audit", async () => {
  const h = await harness(["institution_admin"]);
  try {
    await h.page.getByRole("button", { name: "Auditoría administrativa", exact: true }).click();
    await h.page.locator("strong").filter({ hasText: /^account\.created$/ }).waitFor();
    assert.equal(await h.page.getByRole("button", { name: "Histórico e informes", exact: true }).count(), 0);
    assert.equal(h.state.queries.length, 0);
  } finally { await h.context.close(); }
});

test("historical detail preserves arrival reason and closure chronology without write controls", async () => {
  const h = await harness();
  try {
    await h.context.route("**/api/v1/reports/emergencies/*/", (route) => route.fulfill({ json: { ...episode(1), closed_at: "2026-11-13T13:30:00Z", arrival_reason: "Ingreso excepcional sintético H", arrived_by_id: "receiver-h", closed_by_id: "receiver-h" } }));
    await h.page.getByRole("button", { name: "Histórico e informes", exact: true }).click();
    await h.page.getByRole("button", { name: /Ver episodio.*H 1/ }).click();
    const detail = h.page.getByRole("region", { name: "Consulta del episodio histórico" });
    await detail.getByText("Ingreso excepcional sintético H", { exact: true }).waitFor();
    await detail.locator('time[datetime="2026-11-13T12:30:00Z"]').waitFor();
    await detail.locator('time[datetime="2026-11-13T13:30:00Z"]').waitFor();
    assert.equal(await detail.getByRole("button", { name: /Confirmar lectura|Registrar preparación|Cerrar episodio/ }).count(), 0);
  } finally { await h.context.close(); }
});

test("an alien historical detail is rejected instead of displaying another episode", async () => {
  const h = await harness();
  try {
    h.state.detailAlien = true;
    await h.page.getByRole("button", { name: "Histórico e informes", exact: true }).click();
    await h.page.getByRole("button", { name: /Ver episodio.*H 1/ }).click();
    await h.page.getByRole("alert").filter({ hasText: "El detalle recibido no corresponde al episodio solicitado." }).waitFor();
    assert.equal(await h.page.getByText("Episodio sintético H 999", { exact: true }).count(), 0);
  } finally { await h.context.close(); }
});

test("out-of-order filtered responses never replace the newer applied query", async () => {
  const h = await harness(); let release;
  try {
    await h.page.getByRole("button", { name: "Histórico e informes", exact: true }).click();
    await h.page.getByText("27 episodios", { exact: true }).waitFor();
    const held = new Promise((resolve) => { release = resolve; });
    h.state.hold = (url) => url.searchParams.get("status") === "cancelada" ? held : Promise.resolve();
    await h.page.getByLabel("Estado del informe", { exact: true }).selectOption("cancelada");
    const oldRequest = h.page.waitForRequest((request) => request.url().includes("status=cancelada"));
    await h.page.getByRole("button", { name: "Aplicar filtros", exact: true }).click(); await oldRequest;
    await h.page.getByLabel("Estado del informe", { exact: true }).selectOption("cerrada");
    await h.page.getByRole("button", { name: "Aplicar filtros", exact: true }).click();
    await h.page.getByText("Episodio sintético H 1", { exact: true }).waitFor();
    const oldResponse = h.page.waitForResponse((response) => response.url().includes("status=cancelada"));
    release(); await (await oldResponse).finished(); await h.page.evaluate(() => new Promise(requestAnimationFrame));
    assert.equal(await h.page.getByText("Episodio sintético H 2", { exact: true }).count(), 0);
    await h.page.getByText("Episodio sintético H 1", { exact: true }).waitFor();
  } finally { release?.(); await h.context.close(); }
});

for (const revoked of [false, true]) test(`a late report cannot restore data after ${revoked ? "permission withdrawal" : "logout"}`, async () => {
  const h = await harness(["urgencias", "view_reports"], revoked); let release;
  try {
    const held = new Promise((resolve) => { release = resolve; }); h.state.hold = () => held;
    await h.page.getByRole("button", { name: "Histórico e informes", exact: true }).click();
    await h.page.getByText("Consultando en servidor…", { exact: true }).waitFor();
    if (revoked) {
      h.user.groups = ["urgencias"];
      const session = h.page.waitForResponse((response) => response.url().includes("/auth/me/"));
      await h.page.clock.fastForward(30_001); await session;
      await h.page.getByRole("button", { name: "Histórico e informes", exact: true }).waitFor({ state: "detached" });
    } else {
      await h.page.getByRole("button", { name: "Cerrar sesión", exact: true }).click();
      await h.page.getByRole("button", { name: "Iniciar sesión", exact: true }).waitFor();
    }
    const old = h.page.waitForResponse((response) => response.url().includes("/reports/emergencies/"));
    release(); await (await old).finished();
    assert.equal(await h.page.getByText("27 episodios", { exact: true }).count(), 0);
    assert.equal(await h.page.getByText("Episodio sintético H 1", { exact: true }).count(), 0);
  } finally { release?.(); await h.context.close(); }
});
