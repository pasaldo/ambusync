import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { chromium } from "playwright";
import { mockAuthenticatedApi } from "./mock-auth-api.mjs";

const BASE = process.env.BASE_URL || "http://127.0.0.1:5174";
let browser;
before(async () => { browser = await chromium.launch(); });
after(async () => { await browser.close(); });

function episodeFixture() {
  return { id: "10000000-0000-4000-8000-000000000099", destination_id: "demo-hospital-id", destination_name: "Hospital Central Demo", ambulance_code: "SYN-01", status: "en_traslado", version: 1, patient: { identity_unknown: false, alias: "Caso sintético E", age_value: null, age_unit: null, recorded_sex: null }, reason: "Prueba sintética de hitos", notes: "", symptoms: [], triage: "C2", created_at: "2026-11-13T10:00:00Z", vital_measurements: [], read_at: null, read_by_id: null, prepared_at: null, prepared_by_id: null, arrived_at: null, arrival_reason: "" };
}

async function harness(episode = episodeFixture(), groups = ["urgencias"]) {
  const context = await browser.newContext();
  await mockAuthenticatedApi(context, { groups });
  const now = Date.now() / 1000;
  const state = { expired: false, expireNext: false, loseNext: false, corruptNext: false, wrongIdNext: false, posts: [], accepted: new Map(), user: { id: groups.includes("urgencias") ? "synthetic-e-reader" : "synthetic-e-operator", username: "synthetic_e_user", groups, institutions: [{ id: "demo-hospital-id", name: "Hospital Central Demo" }], ambulance: groups.includes("ambulance") ? { id: "demo-ambulance-id", code: "SYN-01" } : null, session: { started_at: now, idle_expires_at: now + 1800, absolute_expires_at: now + 43200 } } };
  await context.route("**/api/v1/auth/me/", (route) => route.fulfill(state.expired ? { status: 401, json: { code: "session_expired", message: "Sesión expirada." } } : { json: state.user }));
  await context.route("**/api/v1/auth/login/", (route) => { state.expired = false; return route.fulfill({ json: { ok: true } }); });
  await context.route("**/api/v1/auth/logout/", (route) => { state.expired = true; return route.fulfill({ status: 204 }); });
  await context.route("**/api/v1/emergencies/**", async (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: { results: [episode], next: null, previous: null, count: 1 } });
    const body = route.request().postDataJSON();
    const action = new URL(route.request().url()).pathname.split("/").at(-2);
    state.posts.push({ action, body });
    if (state.expireNext) { state.expireNext = false; state.expired = true; return route.fulfill({ status: 401, json: { code: "session_expired", message: "Sesión expirada." } }); }
    if (!state.accepted.has(body.operation_id)) {
      assert.equal(body.expected_version, episode.version);
      const field = action === "read" ? "read" : "prepared";
      if (action === "prepare") assert.ok(episode.read_at, "preparación requiere lectura");
      if (!episode[`${field}_at`]) {
        episode[`${field}_at`] = action === "read" ? "2026-11-13T12:00:00Z" : "2026-11-13T12:01:00Z";
        episode[`${field}_by_id`] = state.user.id;
        episode.version += 1;
      }
      state.accepted.set(body.operation_id, JSON.stringify(body));
    } else assert.equal(JSON.stringify(body), state.accepted.get(body.operation_id));
    if (state.loseNext) { state.loseNext = false; return route.abort("failed"); }
    if (state.corruptNext) { state.corruptNext = false; return route.fulfill({ json: { ...episode, read_at: null, read_by_id: null } }); }
    if (state.wrongIdNext) { state.wrongIdNext = false; return route.fulfill({ json: { ...episode, id: "10000000-0000-4000-8000-000000000098" } }); }
    return route.fulfill({ json: episode });
  });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  await page.addInitScript(() => {
    window.WebSocket = class extends EventTarget {
      static CONNECTING = 0; static OPEN = 1; static CLOSING = 2; static CLOSED = 3;
      readyState = 0;
      constructor() { super(); window.__milestoneSocket = this; }
      close() { this.readyState = 3; }
    };
    window.__milestoneNotify = (event) => window.__milestoneSocket.dispatchEvent(new MessageEvent("message", { data: JSON.stringify(event) }));
  });
  await page.goto(`${BASE}/local`);
  await page.getByRole("heading", { name: "synthetic_e_user" }).waitFor();
  async function detail() {
    await page.getByRole("button", { name: /Caso sintético E/ }).click();
    return page.getByRole("dialog", { name: "Detalle de episodio" });
  }
  async function notify(type = "emergency.read_confirmed") {
    await page.evaluate((event) => window.__milestoneNotify(event), { event_id: crypto.randomUUID(), emergency_id: episode.id, type, version: episode.version });
  }
  async function login() {
    await page.getByLabel("Usuario", { exact: true }).fill("synthetic_e_user");
    await page.getByLabel("Contraseña", { exact: true }).fill("synthetic-password");
    await page.getByRole("button", { name: "Iniciar sesión" }).click();
    await page.getByRole("heading", { name: "synthetic_e_user" }).waitFor();
  }
  return { context, page, state, episode, detail, notify, login };
}

test("opening detail never reads; explicit read then preparation are visible read-only to ambulance", async () => {
  const receiver = await harness();
  const operator = await harness(receiver.episode, ["ambulance"]);
  try {
    await operator.page.getByRole("button", { name: "Episodios de la unidad", exact: true }).click();
    await operator.page.getByText("Lectura no confirmada.", { exact: true }).waitFor();
    assert.equal(await operator.page.getByRole("button", { name: "Confirmar lectura", exact: true }).count(), 0);
    const dialog = await receiver.detail();
    assert.equal(receiver.state.posts.length, 0);
    assert.equal(receiver.episode.read_at, null);
    assert.equal(await dialog.getByRole("button", { name: "Registrar preparación", exact: true }).isDisabled(), true);
    await dialog.getByRole("button", { name: "Confirmar lectura", exact: true }).click();
    await dialog.getByText(/Primera lectura confirmada/).waitFor();
    assert.equal(receiver.episode.version, 2);
    await operator.notify();
    await operator.page.getByText(/Primera lectura confirmada/).waitFor();
    await dialog.getByRole("button", { name: "Registrar preparación", exact: true }).click();
    await dialog.getByText(/Primera preparación registrada/).waitFor();
    await operator.notify("emergency.preparation_recorded");
    await operator.page.getByText(/Primera preparación registrada/).waitFor();
    assert.equal(receiver.episode.status, "en_traslado");
    assert.equal(receiver.episode.version, 3);
    assert.equal(receiver.state.posts.length, 2);
    assert.equal(operator.state.posts.length, 0);
    // A new operation over an already-recorded milestone returns the same version.
    const noop = await receiver.page.evaluate(async (current) => {
      const backend = await import("/src/lib/backend.ts");
      return backend.sendEmergencyOperation(backend.prepareEmergencyTransition(current, "read"), () => true);
    }, receiver.episode);
    assert.equal(noop.version, 3);
    assert.equal(noop.read_by_id, "synthetic-e-reader");
    await receiver.page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await receiver.page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    if (process.env.MILESTONES_SCREENSHOT) await receiver.page.screenshot({ path: process.env.MILESTONES_SCREENSHOT, fullPage: true });
  } finally { await receiver.context.close(); await operator.context.close(); }
});

test("lost reading response freezes preparation; exact retry remains resolvable inside detail after arrival", async () => {
  const h = await harness();
  try {
    const dialog = await h.detail();
    h.state.loseNext = true;
    await dialog.getByRole("button", { name: "Confirmar lectura", exact: true }).click();
    await dialog.getByRole("button", { name: "Reintentar operación del episodio", exact: true }).waitFor();
    h.episode.status = "llegado"; h.episode.arrived_at = "2026-11-13T12:02:00Z"; h.episode.version += 1;
    await h.notify("emergency.arrived");
    await dialog.getByText(/Primera lectura confirmada/).waitFor();
    assert.equal(await dialog.getByRole("button", { name: "Registrar preparación", exact: true }).count(), 0);
    await dialog.getByRole("button", { name: "Reintentar operación del episodio", exact: true }).click();
    await h.page.getByRole("status").filter({ hasText: "Operación confirmada" }).waitFor();
    assert.deepEqual(h.state.posts[0], h.state.posts[1]);
    assert.equal(h.episode.version, 3);
    assert.equal(h.episode.prepared_at, null);
  } finally { await h.context.close(); }
});

for (const fault of ["corruptNext", "wrongIdNext"]) {
  test(`${fault}: missing milestone proof or alien episode cannot confirm the action`, async () => {
    const h = await harness();
    try {
      const dialog = await h.detail();
      h.state[fault] = true;
      await dialog.getByRole("button", { name: "Confirmar lectura", exact: true }).click();
      await dialog.getByRole("button", { name: "Reintentar operación del episodio", exact: true }).waitFor();
      await dialog.getByRole("button", { name: "Reintentar operación del episodio", exact: true }).click();
      await h.page.getByRole("status").filter({ hasText: "Operación confirmada" }).waitFor();
      assert.deepEqual(h.state.posts[0], h.state.posts[1]);
      assert.equal(h.episode.version, 2);
    } finally { await h.context.close(); }
  });
}

for (const changeAccount of [false, true]) {
  test(`expired read preserves exact attempt only for same account (change=${changeAccount})`, async () => {
    const h = await harness();
    try {
      const dialog = await h.detail();
      h.state.expireNext = true;
      await dialog.getByRole("button", { name: "Confirmar lectura", exact: true }).click();
      await h.page.getByRole("button", { name: "Iniciar sesión" }).waitFor();
      if (changeAccount) h.state.user.id = "synthetic-e-replacement";
      await h.login();
      assert.equal(h.state.posts.length, 1, "login never resends");
      if (changeAccount) {
        assert.equal(await h.page.getByRole("button", { name: "Reintentar operación", exact: true }).count(), 0);
        assert.equal(h.episode.read_at, null);
      } else {
        await h.page.getByRole("button", { name: "Reintentar operación", exact: true }).click();
        await h.page.getByRole("status").filter({ hasText: "Operación confirmada" }).waitFor();
        assert.deepEqual(h.state.posts[0], h.state.posts[1]);
        assert.equal(h.episode.read_by_id, "synthetic-e-reader");
      }
    } finally { await h.context.close(); }
  });
}
