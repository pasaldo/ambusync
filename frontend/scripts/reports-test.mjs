import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { chromium } from "playwright";
import { mockAuthenticatedApi, historyFixture } from "./mock-auth-api.mjs";

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

test("operational urgencias retains basic archive and all pending arrivals without reports", async () => {
  const h = await harness(["urgencias"]);
  try {
    h.state.live = Array.from({ length: 26 }, (_, i) => episode(i + 1, "llegado"));
    await h.page.reload();
    await h.page.getByRole("heading", { name: "synthetic_h" }).waitFor();
    assert.equal(await h.page.getByRole("button", { name: "Archivo de Urgencias", exact: true }).count(), 1);
    assert.equal(await h.page.getByRole("button", { name: "Histórico e informes", exact: true }).count(), 0);
    await h.page.getByText("Episodio sintético H 1", { exact: true }).waitFor();
    await h.page.getByText("Episodio sintético H 26", { exact: true }).waitFor();
  } finally { await h.context.close(); }
});

for (const groups of [["urgencias"], ["urgencias", "institution_admin"], ["urgencias", "institution_admin", "view_reports"]]) test(`archive and audit coexist with independent permissions: ${groups.join("+")}`, async () => {
  const h = await harness(groups);
  try {
    await h.context.route("**/api/v1/emergencies/history/**", (route) => route.fulfill({ json: historyFixture([episode(42)], route.request().url()) }));
    await h.context.route("**/api/v1/emergencies/10000000-0000-4000-8000-000000000042/", (route) => route.fulfill({ json: episode(42) }));
    await h.page.getByRole("button", { name: "Archivo de Urgencias", exact: true }).click();
    await h.page.getByRole("heading", { name: "Archivo de episodios", exact: true }).waitFor();
    await h.page.getByRole("button", { name: /Ver episodio.*H 42/ }).click();
    await h.page.getByRole("heading", { name: "Detalle histórico", exact: true }).waitFor();
    assert.equal(h.state.queries.length, 0, "basic archive must not request report endpoints");
    assert.equal(await h.page.getByRole("button", { name: "Histórico e informes", exact: true }).count(), groups.includes("view_reports") ? 1 : 0);
    const audit = h.page.getByRole("button", { name: "Auditoría administrativa", exact: true });
    assert.equal(await audit.count(), groups.includes("institution_admin") ? 1 : 0);
    if (groups.includes("institution_admin")) {
      await h.page.getByRole("dialog", { name: "Detalle de episodio", exact: true }).getByRole("button", { name: "Cerrar", exact: true }).click();
      await audit.click();
      await h.page.locator("strong").filter({ hasText: /^account\.created$/ }).waitFor();
      await h.page.getByRole("button", { name: "Archivo de Urgencias", exact: true }).click();
      await h.page.getByRole("heading", { name: "Archivo de episodios", exact: true }).waitFor();
    }
  } finally { await h.context.close(); }
});

test("basic archive filters and paginates by event date without report summaries", async () => {
  const h = await harness(["urgencias"]);
  try {
    const rows = Array.from({ length: 28 }, (_, i) => ({ ...episode(i + 101), closed_at: "2026-11-14T02:00:00Z", created_at: "2025-01-01T12:00:00Z" }));
    const reads = [];
    await h.context.route("**/api/v1/emergencies/history/**", (route) => {
      reads.push(route.request().url());
      return route.fulfill({ json: historyFixture(rows, route.request().url()) });
    });
    await h.page.getByRole("button", { name: "Archivo de Urgencias", exact: true }).click();
    await h.page.getByText("28 episodios", { exact: true }).waitFor();
    await h.page.locator('time[datetime="2026-11-14T02:00:00Z"]').first().waitFor();
    assert.equal(await h.page.getByRole("heading", { name: "Por estado" }).count(), 0);
    await h.page.getByLabel("Fecha del archivo", { exact: true }).fill("2026-11-13");
    await h.page.getByLabel("Estado del archivo", { exact: true }).selectOption("cerrada");
    const filtered = h.page.waitForResponse((r) => r.url().includes("day=13"));
    await h.page.getByRole("button", { name: "Aplicar filtros", exact: true }).click(); await filtered;
    await h.page.getByRole("button", { name: "Página siguiente", exact: true }).click();
    await h.page.getByText("Página 2", { exact: true }).waitFor();
    assert.match(reads.at(-1), /page=2/);
    assert.match(reads.at(-1), /year=2026/);
    assert.equal(h.state.queries.length, 0);
    await h.page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await h.page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    if (process.env.HISTORY_SCREENSHOT) await h.page.screenshot({ path: process.env.HISTORY_SCREENSHOT, fullPage: true });
  } finally { await h.context.close(); }
});

test("archive uses urgencias cards and a keyboard accessible modal with complete read-only detail", async () => {
  const h = await harness(["urgencias"]);
  try {
    const row = { ...episode(42), closed_at: "2026-11-13T13:30:00Z", arrival_reason: "Motivo excepcional sintético", notes: "Nota histórica sintética", symptoms: ["Disnea sintética"] };
    await h.context.route("**/api/v1/emergencies/history/**", (route) => route.fulfill({ json: historyFixture([row], route.request().url()) }));
    await h.context.route(`**/api/v1/emergencies/${row.id}/`, (route) => route.fulfill({ json: row }));
    await h.page.getByRole("button", { name: "Archivo de Urgencias", exact: true }).click();
    const card = h.page.getByRole("button", { name: /Ver episodio.*H 42/ });
    await card.getByText("Signos vitales", { exact: true }).waitFor();
    await card.getByText(/C2/).waitFor();
    await card.click();
    const modal = h.page.getByRole("dialog", { name: "Detalle de episodio", exact: true });
    await modal.getByText("Motivo excepcional sintético", { exact: true }).waitFor();
    await modal.getByText(/Nota histórica sintética/).waitFor();
    await modal.getByText(/Disnea sintética/).waitFor();
    await modal.locator('time[datetime="2026-11-13T13:30:00Z"]').waitFor();
    assert.equal(await modal.getByRole("button", { name: /Confirmar lectura|Registrar preparación|Cerrar episodio/ }).count(), 0);
    assert.equal(await modal.evaluate((node) => node.contains(node.ownerDocument.activeElement)), true);
    await h.page.keyboard.press("Tab");
    assert.equal(await modal.evaluate((node) => node.contains(node.ownerDocument.activeElement)), true);
    await h.page.keyboard.press("Escape");
    await modal.waitFor({ state: "detached" });
    assert.equal(await card.evaluate((node) => node === node.ownerDocument.activeElement), true);
    await card.click();
    await h.page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await modal.evaluate((node) => node.scrollWidth > node.clientWidth), false);
    if (process.env.ARCHIVE_MODAL_SCREENSHOT) await h.page.screenshot({ path: process.env.ARCHIVE_MODAL_SCREENSHOT, fullPage: true });
    await modal.getByRole("button", { name: "Cerrar", exact: true }).click();
    await modal.waitFor({ state: "detached" });
  } finally { await h.context.close(); }
});

test("archive calendar and unit filter compose on server and survive pagination", async () => {
  const h = await harness(["urgencias"]);
  try {
    const rows = Array.from({ length: 28 }, (_, i) => ({ ...episode(i + 101), closed_at: "2026-11-14T02:00:00Z" }));
    rows.push({ ...episode(999), ambulance_id: "unit-other", ambulance_code: "SYN-OTHER", closed_at: "2026-11-14T02:00:00Z" });
    const requests = [];
    await h.context.route("**/api/v1/emergencies/history/**", (route) => {
      requests.push(route.request().url());
      return route.fulfill({ json: historyFixture(rows, route.request().url()) });
    });
    await h.page.getByRole("button", { name: "Archivo de Urgencias", exact: true }).click();
    await h.page.getByText("29 episodios", { exact: true }).waitFor();
    const date = h.page.getByLabel("Fecha del archivo", { exact: true });
    assert.equal(await date.getAttribute("type"), "date");
    await date.fill("2026-11-13");
    await h.page.getByLabel("Unidad del archivo", { exact: true }).selectOption("unit-h");
    await h.page.getByRole("button", { name: "Aplicar filtros", exact: true }).click();
    await h.page.getByText("28 episodios", { exact: true }).waitFor();
    await h.page.getByRole("button", { name: "Página siguiente", exact: true }).click();
    await h.page.getByRole("button", { name: /Ver episodio.*H 128/ }).waitFor();
    assert.match(requests.at(-1), /ambulance_id=unit-h/);
    assert.match(requests.at(-1), /day=13/);
    assert.match(requests.at(-1), /month=11/);
    assert.match(requests.at(-1), /year=2026/);
    assert.match(requests.at(-1), /page=2/);
    await date.fill("");
    await h.page.getByLabel("Unidad del archivo", { exact: true }).selectOption("");
    await h.page.getByRole("button", { name: "Aplicar filtros", exact: true }).click();
    await h.page.getByText("29 episodios", { exact: true }).waitFor();
    assert.equal(new URL(requests.at(-1)).searchParams.has("day"), false);
    assert.equal(new URL(requests.at(-1)).searchParams.has("ambulance_id"), false);
  } finally { await h.context.close(); }
});

test("closing a loading archive modal prevents its late detail from replacing a reopened episode", async () => {
  const h = await harness(["urgencias"]); let release;
  try {
    const held = new Promise((resolve) => { release = resolve; });
    const rows = [episode(42), episode(43)];
    await h.context.route("**/api/v1/emergencies/history/**", (route) => route.fulfill({ json: historyFixture(rows, route.request().url()) }));
    await h.context.route(`**/api/v1/emergencies/${rows[0].id}/`, async (route) => { await held; return route.fulfill({ json: rows[0] }); });
    await h.context.route(`**/api/v1/emergencies/${rows[1].id}/`, (route) => route.fulfill({ json: rows[1] }));
    await h.page.getByRole("button", { name: "Archivo de Urgencias", exact: true }).click();
    const request = h.page.waitForRequest((r) => r.url().endsWith(`/${rows[0].id}/`));
    await h.page.getByRole("button", { name: /Ver episodio.*H 42/ }).click(); await request;
    await h.page.keyboard.press("Escape");
    await h.page.getByRole("dialog").waitFor({ state: "detached" });
    await h.page.getByRole("button", { name: /Ver episodio.*H 43/ }).click();
    const modal = h.page.getByRole("dialog", { name: "Detalle de episodio", exact: true });
    await modal.getByText("Episodio sintético H 43", { exact: true }).waitFor();
    const response = h.page.waitForResponse((r) => r.url().endsWith(`/${rows[0].id}/`));
    release(); await (await response).finished();
    await h.page.evaluate(() => new Promise(requestAnimationFrame));
    assert.equal(await modal.getByText("Episodio sintético H 42", { exact: true }).count(), 0);
    await modal.getByText("Episodio sintético H 43", { exact: true }).waitFor();
  } finally { release?.(); await h.context.close(); }
});

for (const fault of ["rejected", "lost"]) test(`patient deactivation feedback and exact retry stay inside archive modal: ${fault}`, async () => {
  const h = await harness(["urgencias", "deactivate_patients"]);
  try {
    const row = { ...episode(42), patient_id: "10000000-0000-4000-8000-000000000201", patient_record_version: 1, patient_record_enabled: true };
    await h.context.route("**/api/v1/emergencies/history/**", (route) => route.fulfill({ json: historyFixture([row], route.request().url()) }));
    await h.context.route(`**/api/v1/emergencies/${row.id}/`, (route) => route.fulfill({ json: row }));
    const posts = [];
    await h.context.route(`**/api/v1/emergencies/${row.id}/patient-deactivate/`, (route) => {
      posts.push(route.request().postDataJSON());
      if (fault === "rejected") return route.fulfill({ status: 409, json: { code: "conflict", message: "El paciente mantiene episodios pendientes." } });
      if (posts.length === 1) return route.abort("failed");
      assert.deepEqual(posts[1], posts[0], "retry must reuse body, version and operation UUID");
      row.patient_record_enabled = false; row.patient_record_version = 2;
      return route.fulfill({ json: { id: row.patient_id, enabled: false, version: 2 } });
    });
    await h.page.getByRole("button", { name: "Archivo de Urgencias", exact: true }).click();
    await h.page.getByRole("button", { name: /Ver episodio.*H 42/ }).click();
    const modal = h.page.getByRole("dialog", { name: "Detalle de episodio", exact: true });
    h.page.on("dialog", (dialog) => dialog.accept());
    await modal.getByRole("button", { name: "Desactivar paciente sintético", exact: true }).click();
    if (fault === "rejected") {
      await modal.getByRole("alert").filter({ hasText: "El paciente mantiene episodios pendientes." }).waitFor();
      assert.equal(posts.length, 1);
    } else {
      await modal.getByRole("alert").filter({ hasText: "Resultado de registro sin confirmar." }).waitFor();
      await modal.getByRole("button", { name: "Reintentar operación de registro", exact: true }).click();
      await modal.getByRole("status").filter({ hasText: "Operación de registro confirmada" }).waitFor();
      assert.equal(posts.length, 2);
      await modal.getByRole("button", { name: "Desactivar paciente sintético", exact: true }).waitFor({ state: "detached" });
    }
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
