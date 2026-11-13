import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { chromium } from "playwright";
import { mockAuthenticatedApi } from "./mock-auth-api.mjs";

const BASE = process.env.BASE_URL || "http://127.0.0.1:5174";
let browser;
before(async () => { browser = await chromium.launch(); });
after(async () => { await browser.close(); });
const oldId = "10000000-0000-4000-8000-000000000101";
const newId = "10000000-0000-4000-8000-000000000102";

async function harness() {
  const context = await browser.newContext();
  await mockAuthenticatedApi(context, { groups: ["ambulance"] });
  const now = Date.now() / 1000;
  const user = { id: "synthetic-f-operator", username: "synthetic_f", groups: ["ambulance"], institutions: [{ id: "operator-f", name: "Operadora sintética F" }], ambulance: { id: "unit-f", code: "SYN-F" }, session: { started_at: now, idle_expires_at: now + 1800, absolute_expires_at: now + 43200 } };
  const original = { id: oldId, ambulance_id: "unit-f", operating_institution_id: "operator-f", ambulance_code: "SYN-F", destination_id: "hospital-a", destination_name: "Hospital A sintético", status: "en_traslado", version: 1, patient: { identity_unknown: true, alias: null, age_value: null, age_unit: null, recorded_sex: null }, reason: "Caso sintético F", notes: "Antecedente del emisor", symptoms: [], triage: "C2", created_at: "2026-11-13T10:00:00Z", transfer_declared_at: "2026-11-13T10:00:00Z", transfer_declared_by_id: user.id, vital_measurements: [{ id: "1", kind: "heart_rate", value: 75, unit: "lpm", measured_at: "2026-11-13T10:00:00Z", recorded_at: "2026-11-13T10:01:00Z", recorded_by_id: "synthetic-original-author", is_current: true }], read_at: "2026-11-13T10:03:00Z", read_by_id: "synthetic-receiver-a", prepared_at: "2026-11-13T10:04:00Z", prepared_by_id: "synthetic-receiver-a", replaces_id: null, replaced_by_id: null, cancelled_at: null, cancelled_by_id: null, cancellation_reason: "" };
  const state = { expired: false, expireNext: false, loseNext: false, corrupt: "", conflictNext: false, posts: [], replacement: null, accepted: new Map() };
  await context.route("**/api/v1/auth/me/", (route) => route.fulfill(state.expired ? { status: 401, json: { code: "session_expired", message: "Sesión expirada." } } : { json: user }));
  await context.route("**/api/v1/auth/login/", (route) => { state.expired = false; return route.fulfill({ json: { ok: true } }); });
  await context.route("**/api/v1/institutions/destinations/", (route) => route.fulfill({ json: [{ id: "hospital-a", name: "Hospital A sintético" }, { id: "hospital-b", name: "Hospital B sintético" }] }));
  await context.route("**/api/v1/emergencies/**", async (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: { count: state.replacement ? 2 : 1, next: null, previous: null, results: state.replacement ? [state.replacement, original] : [original] } });
    assert.ok(route.request().url().endsWith(`/${oldId}/change-destination/`));
    const body = route.request().postDataJSON(); state.posts.push(body);
    if (state.expireNext) { state.expireNext = false; state.expired = true; return route.fulfill({ status: 401, json: { code: "session_expired", message: "Sesión expirada." } }); }
    if (state.conflictNext) { state.conflictNext = false; original.version += 1; return route.fulfill({ status: 409, json: { code: "operation_conflict", message: "La versión cambió." } }); }
    if (!state.accepted.has(body.operation_id)) {
      assert.equal(body.expected_version, original.version);
      assert.equal(body.destination_id, "hospital-b");
      state.replacement = { ...structuredClone(original), id: newId, replaces_id: oldId, replaced_by_id: null, destination_id: "hospital-b", destination_name: "Hospital B sintético", version: 1, read_at: null, read_by_id: null, prepared_at: null, prepared_by_id: null, created_at: "2026-11-13T11:00:00Z", vital_measurements: original.vital_measurements.map((m) => ({ ...m, id: "2", inherited_at: "2026-11-13T11:00:00Z" })) };
      Object.assign(original, { status: "cancelada", version: original.version + 1, replaced_by_id: newId, cancelled_at: "2026-11-13T11:00:00Z", cancelled_by_id: user.id, cancellation_reason: body.reason });
      state.accepted.set(body.operation_id, JSON.stringify(body));
    } else assert.equal(JSON.stringify(body), state.accepted.get(body.operation_id), "retry exacto sobre original");
    if (state.loseNext) { state.loseNext = false; return route.abort("failed"); }
    const response = { original: structuredClone(original), replacement: structuredClone(state.replacement) };
    const corrupt = state.corrupt; state.corrupt = "";
    if (corrupt === "missing") delete response.replacement;
    if (corrupt === "alien") response.original.id = newId;
    if (corrupt === "link") response.replacement.replaces_id = newId;
    if (corrupt === "destination") response.replacement.destination_id = "hospital-a";
    if (corrupt === "patient") response.replacement.patient = { identity_unknown: false, alias: "Paciente sintético ajeno", age_value: 9, age_unit: "years", recorded_sex: "F" };
    return route.fulfill({ json: response });
  });
  const page = await context.newPage(); page.setDefaultTimeout(10000);
  await page.addInitScript(() => {
    window.WebSocket = class extends EventTarget { static CONNECTING = 0; static OPEN = 1; static CLOSING = 2; static CLOSED = 3; readyState = 0; close() { this.readyState = 3; } };
  });
  await page.goto(`${BASE}/local`);
  await page.getByRole("button", { name: "Episodios de la unidad", exact: true }).click();
  async function open() {
    await page.getByRole("button", { name: "Cambiar destino", exact: true }).click();
    await page.getByLabel("Nuevo destino", { exact: true }).selectOption("hospital-b");
    await page.getByLabel("Motivo del cambio de destino", { exact: true }).fill("Derivación sintética autorizada");
  }
  async function submit() { await page.getByRole("button", { name: "Confirmar cambio de destino", exact: true }).click(); }
  async function login() {
    await page.getByLabel("Usuario", { exact: true }).fill("synthetic_f");
    await page.getByLabel("Contraseña", { exact: true }).fill("synthetic-password");
    await page.getByRole("button", { name: "Iniciar sesión" }).click();
    await page.getByRole("heading", { name: "synthetic_f", exact: true }).waitFor();
  }
  return { context, page, original, state, user, open, submit, login };
}

test("explicit form changes both episodes, clears receiver milestones and labels inherited samples", async () => {
  const h = await harness();
  try {
    await h.open(); assert.equal(h.state.posts.length, 0);
    assert.equal(await h.page.getByLabel("Nuevo destino").locator('option[value="hospital-a"]').count(), 0);
    await h.page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await h.page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    if (process.env.DESTINATION_SCREENSHOT) await h.page.screenshot({ path: process.env.DESTINATION_SCREENSHOT, fullPage: true });
    await h.submit();
    await h.page.getByRole("status").filter({ hasText: "Destino cambiado" }).waitFor();
    await h.page.getByText(`Reemplazado por episodio ${newId}`, { exact: true }).waitFor();
    await h.page.getByText(`Reemplaza al episodio ${oldId}`, { exact: true }).waitFor();
    assert.equal(h.original.status, "cancelada");
    assert.equal(h.state.replacement.read_at, null);
    assert.equal(h.state.replacement.transfer_declared_at, h.original.transfer_declared_at);
    await h.page.getByRole("button", { name: "Actualizar antecedentes y mediciones", exact: true }).click();
    await h.page.getByText(/Antecedente heredado; no es una nueva captura/).waitFor();
    assert.equal(h.state.replacement.vital_measurements[0].recorded_at, h.original.vital_measurements[0].recorded_at);
  } finally { await h.context.close(); }
});

for (const fault of ["loseNext", "missing", "alien", "link", "destination", "patient"]) {
  test(`${fault}: uncertain pair requires exact retry even after authoritative list advances`, async () => {
    const h = await harness();
    try {
      await h.open();
      if (fault === "loseNext") h.state.loseNext = true; else h.state.corrupt = fault;
      await h.submit();
      const retry = h.page.getByRole("button", { name: "Reintentar operación", exact: true });
      await retry.waitFor();
      await h.page.getByRole("button", { name: "Actualizar", exact: true }).click();
      await h.page.getByText(`Reemplazado por episodio ${newId}`, { exact: true }).waitFor();
      h.state.replacement.status = "llegado"; h.state.replacement.version += 1;
      await retry.click();
      await h.page.getByRole("status").filter({ hasText: "Operación confirmada" }).waitFor();
      assert.deepEqual(h.state.posts[0], h.state.posts[1]);
      assert.equal(h.state.posts.length, 2);
      assert.equal(h.state.replacement.status, "llegado");
    } finally { await h.context.close(); }
  });
}

test("stale draft is not silently rebased, conflict leaves editable reason for explicit review", async () => {
  const h = await harness();
  try {
    await h.open();
    h.original.version += 1;
    await h.page.getByRole("button", { name: "Actualizar", exact: true }).click();
    await h.page.getByText(/El episodio cambió desde que preparaste el cambio de destino/).waitFor();
    assert.equal(await h.page.getByRole("button", { name: "Confirmar cambio de destino" }).isDisabled(), true);
    assert.equal(await h.page.getByLabel("Motivo del cambio de destino").inputValue(), "Derivación sintética autorizada");
    await h.page.getByRole("button", { name: "Cargar versión actual para destino", exact: true }).click();
    await h.page.getByLabel("Nuevo destino").selectOption("hospital-b");
    await h.page.getByLabel("Motivo del cambio de destino").fill("Nueva revisión sintética");
    h.state.conflictNext = true;
    await h.submit();
    await h.page.getByText(/El episodio cambió desde que preparaste el cambio de destino/).waitFor();
    assert.equal(await h.page.getByLabel("Motivo del cambio de destino").inputValue(), "Nueva revisión sintética");
    assert.equal(h.state.posts.length, 1);
    assert.equal(h.original.status, "en_traslado");
  } finally { await h.context.close(); }
});

for (const changeAccount of [false, true]) {
  test(`expired attempt recovers only same scope; changeAccount=${changeAccount}`, async () => {
    const h = await harness();
    try {
      await h.open(); h.state.expireNext = true; await h.submit();
      await h.page.getByRole("button", { name: "Iniciar sesión" }).waitFor();
      if (changeAccount) h.user.id = "synthetic-other-f";
      await h.login();
      assert.equal(h.state.posts.length, 1, "login must not send change");
      const retry = h.page.getByRole("button", { name: "Reintentar operación", exact: true });
      if (changeAccount) assert.equal(await retry.count(), 0);
      else {
        await retry.click();
        await h.page.getByRole("status").filter({ hasText: "Operación confirmada" }).waitFor();
        assert.deepEqual(h.state.posts[0], h.state.posts[1]);
      }
    } finally { await h.context.close(); }
  });
}
