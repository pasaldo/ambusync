import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { chromium } from "playwright";
import { mockAuthenticatedApi } from "./mock-auth-api.mjs";

const BASE = process.env.BASE_URL || "http://127.0.0.1:5174";
let browser;
before(async () => { browser = await chromium.launch(); });
after(async () => { await browser.close(); });

async function harness() {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const api = await mockAuthenticatedApi(context, { groups: ["urgencias", "institution_admin"] });
  const units = [
    { id: "unit-on", code: "SYN-ON", institution_id: "demo-operator-id", institution_name: "Operadora sintética", enabled: true, can_deactivate: true, can_reactivate: false },
    { id: "unit-off", code: "SYN-OFF", institution_id: "demo-operator-id", institution_name: "Operadora sintética", enabled: false, can_deactivate: true, can_reactivate: true },
    { id: "unit-denied", code: "SYN-NO", institution_id: "demo-operator-id", institution_name: "Operadora sintética", enabled: false, can_deactivate: false, can_reactivate: false },
  ];
  const account = { id: "200", username: "synthetic_unassigned", email: "unit@example.test", groups: ["ambulance"], active: true, institution_id: "demo-operator-id", institution_name: "Operadora sintética", ambulance: null };
  api.managedAccounts.splice(0, api.managedAccounts.length, account);
  const now = Date.now() / 1000;
  const state = { accept: true, dialogs: [], writes: [], reads: [], mode: "success", hold: null, loggedOut: false,
    user: { id: "reactivation-admin", username: "synthetic_reactivation", groups: ["urgencias", "institution_admin"], institutions: [{ id: "demo-hospital-id", name: "Receptor sintético" }], ambulance: null, session: { started_at: now, idle_expires_at: now + 1800, absolute_expires_at: now + 43200 } } };
  await context.route("**/api/v1/auth/me/", (route) => route.fulfill(state.loggedOut ? { status: 401, json: { code: "session_expired", message: "Sesión expirada." } } : { json: state.user }));
  await context.route("**/api/v1/auth/logout/", (route) => { state.loggedOut = true; return route.fulfill({ status: 204 }); });
  await context.route("**/api/v1/institutions/management/ambulances/**", async (route) => {
    const url = new URL(route.request().url());
    if (route.request().method() === "GET") {
      state.reads.push(url.href);
      return route.fulfill({ json: units.filter((unit) => unit.enabled || url.searchParams.get("include_disabled") === "true") });
    }
    state.writes.push({ path: url.pathname, body: route.request().postDataJSON(), headers: route.request().headers() });
    if (state.hold) await state.hold;
    if (state.mode === "expired") return route.fulfill({ status: 401, json: { code: "session_expired", message: "Sesión expirada." } });
    if (state.mode === "forbidden") return route.fulfill({ status: 403, json: { code: "permission_denied", message: "Unidad no autorizada." } });
    const unit = units.find((item) => url.pathname.endsWith(`/${item.id}/reactivate/`));
    assert.ok(unit, "reactivation uses the explicit endpoint, not deactivation or assignment");
    unit.enabled = true; unit.can_reactivate = false;
    if (state.mode === "lost") return route.abort("failed");
    if (state.mode === "malformed") return route.fulfill({ json: {} });
    await route.fulfill({ status: 204 });
    state.onReply?.();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(6000);
  page.on("dialog", (dialog) => { state.dialogs.push(dialog.message()); return state.accept ? dialog.accept() : dialog.dismiss(); });
  await page.addInitScript(() => {
    window.WebSocket = class extends EventTarget { readyState = 0; close() {} };
    const original = window.setInterval.bind(window);
    window.__reactivationIntervals = new Map();
    window.setInterval = (callback, delay, ...args) => { window.__reactivationIntervals.set(delay, callback); return original(callback, delay, ...args); };
  });
  await page.goto(`${BASE}/local`);
  await page.getByRole("button", { name: "Administración", exact: true }).tap();
  await page.getByRole("button", { name: "Unidades de ambulancia", exact: true }).tap();
  await page.getByText("SYN-OFF · Operadora sintética · Desactivada", { exact: true }).waitFor();
  return { context, page, state, units, account };
}

test("reactivation requires confirmation, refreshes state and selectors but never restores assignment", async () => {
  const h = await harness();
  try {
    const action = h.page.getByRole("button", { name: "Reactivar SYN-OFF", exact: true });
    await action.waitFor();
    assert.equal(await h.page.getByRole("button", { name: "Reactivar SYN-NO", exact: true }).count(), 0);
    assert.equal(await h.page.getByRole("button", { name: "Reactivar SYN-ON", exact: true }).count(), 0);
    assert.ok(h.state.reads.every((url) => new URL(url).searchParams.get("include_disabled") === "true"));
    for (const width of [390, 1280]) {
      await h.page.setViewportSize({ width, height: 844 });
      assert.equal(await h.page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      if (process.env.REACTIVATION_SCREENSHOT_PREFIX) await h.page.screenshot({ path: `${process.env.REACTIVATION_SCREENSHOT_PREFIX}-${width}.png`, fullPage: true });
    }
    await h.page.getByRole("button", { name: "Historial de cuentas", exact: true }).tap();
    const selector = h.page.getByRole("listitem").filter({ hasText: "synthetic_unassigned" }).getByRole("combobox");
    await selector.waitFor();
    assert.deepEqual(await selector.locator("option").evaluateAll((options) => options.map((o) => o.value)), ["", "unit-on"]);
    await h.page.getByRole("button", { name: "Crear cuentas", exact: true }).tap();
    await h.page.getByRole("radio", { name: "Ambulancia", exact: true }).check();
    const createSelector = h.page.getByLabel("Unidad asignada");
    await createSelector.waitFor();
    assert.equal(await createSelector.locator('option[value="unit-off"]').count(), 0);
    await h.page.getByRole("button", { name: "Unidades de ambulancia", exact: true }).tap();
    h.state.accept = false;
    await action.tap();
    assert.equal(h.state.writes.length, 0);
    h.state.accept = true;
    await action.tap();
    await h.page.getByRole("status").filter({ hasText: "Unidad reactivada" }).waitFor();
    await h.page.getByText("SYN-OFF · Operadora sintética · Habilitada", { exact: true }).waitFor();
    assert.equal(h.state.writes.length, 1);
    assert.deepEqual(h.state.writes[0].body, {});
    assert.equal(h.state.writes[0].headers["x-csrftoken"], "browser-test-csrf-token");
    assert.match(h.state.dialogs.at(-1), /No se restaurarán.*asignaciones/);
    assert.equal(h.account.ambulance, null);
    await h.page.getByRole("button", { name: "Historial de cuentas", exact: true }).tap();
    assert.equal(await selector.inputValue(), "");
    assert.equal(await selector.locator('option[value="unit-off"]').count(), 1);
    assert.equal(await selector.locator('option[value="unit-denied"]').count(), 0);
    await h.page.getByRole("button", { name: "Crear cuentas", exact: true }).tap();
    await createSelector.waitFor();
    assert.equal(await createSelector.locator('option[value="unit-off"]').count(), 1);
  } finally { await h.context.close(); }
});

test("reactivation blocks duplicate synchronous clicks while response is pending", async () => {
  const h = await harness(); let release;
  try {
    h.state.hold = new Promise((resolve) => { release = resolve; });
    const sent = h.page.waitForRequest((r) => r.url().endsWith("/unit-off/reactivate/"));
    const action = h.page.getByRole("button", { name: "Reactivar SYN-OFF", exact: true });
    await action.evaluate((button) => {
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await sent;
    assert.equal(await action.isDisabled(), true);
    assert.equal(h.state.writes.length, 1);
    release();
    await h.page.getByRole("status").filter({ hasText: "Unidad reactivada" }).waitFor();
  } finally { release?.(); await h.context.close(); }
});

for (const mode of ["lost", "malformed", "expired", "forbidden"]) test(`reactivation ${mode} requires explicit refresh and never announces success or resends`, async () => {
  const h = await harness();
  try {
    h.state.mode = mode;
    await h.page.getByRole("button", { name: "Reactivar SYN-OFF", exact: true }).tap();
    const refresh = h.page.getByRole("button", { name: "Actualizar administración", exact: true });
    await refresh.waitFor();
    assert.equal(await h.page.getByRole("status").filter({ hasText: "Unidad reactivada" }).count(), 0);
    assert.equal(h.state.writes.length, 1);
    assert.equal(await h.page.getByRole("button", { name: "Reactivar SYN-OFF", exact: true }).isDisabled(), true);
    h.state.mode = "success";
    await refresh.tap();
    await h.page.waitForFunction(() => !document.querySelector("fieldset[disabled]"));
    assert.equal(h.state.writes.length, 1);
    assert.equal(h.account.ambulance, null);
  } finally { await h.context.close(); }
});

for (const leave of ["logout", "scope"]) test(`late reactivation response after ${leave} cannot restore old administration`, async () => {
  const h = await harness(); let release;
  try {
    h.state.hold = new Promise((resolve) => { release = resolve; });
    const sent = h.page.waitForRequest((r) => r.url().endsWith("/unit-off/reactivate/"));
    await h.page.getByRole("button", { name: "Reactivar SYN-OFF", exact: true }).tap(); await sent;
    if (leave === "logout") {
      await h.page.getByRole("button", { name: "Cerrar sesión", exact: true }).tap();
      await h.page.getByRole("button", { name: "Iniciar sesión", exact: true }).waitFor();
    } else {
      h.state.user = { ...h.state.user, groups: ["urgencias"] };
      await h.page.evaluate(() => window.__reactivationIntervals.get(30000)?.());
      await h.page.getByRole("button", { name: "Administración", exact: true }).waitFor({ state: "hidden" });
    }
    const replied = new Promise((resolve) => { h.state.onReply = resolve; });
    release(); await replied;
    await h.page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.equal(await h.page.getByRole("status").filter({ hasText: "Unidad reactivada" }).count(), 0);
    assert.equal(await h.page.getByRole("heading", { name: "Unidades administradas", exact: true }).count(), 0);
    assert.equal(h.state.writes.length, 1);
  } finally { release?.(); await h.context.close(); }
});

test("reactivation waiting on CSRF is not dispatched after logout", async () => {
  const h = await harness(); let release;
  try {
    const held = new Promise((resolve) => { release = resolve; });
    await h.context.route("**/api/v1/auth/csrf/", async (route) => { await held; await route.fulfill({ json: { csrf_token: "late-token" } }); });
    const csrf = h.page.waitForRequest((r) => r.url().endsWith("/auth/csrf/"));
    await h.page.getByRole("button", { name: "Reactivar SYN-OFF", exact: true }).tap(); await csrf;
    // Logout obtains CSRF too; release both only after the panel has unmounted.
    await h.page.getByRole("button", { name: "Cerrar sesión", exact: true }).tap();
    const finished = h.page.waitForResponse((r) => r.url().endsWith("/auth/csrf/"));
    release(); await (await finished).finished();
    await h.page.getByRole("button", { name: "Iniciar sesión", exact: true }).waitFor();
    assert.equal(h.state.writes.length, 0);
  } finally { release?.(); await h.context.close(); }
});
