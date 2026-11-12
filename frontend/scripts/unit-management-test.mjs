import assert from "node:assert/strict";
import { chromium } from "playwright";
import { mockAuthenticatedApi } from "./mock-auth-api.mjs";

const browser = await chromium.launch();
try {
  const context = await browser.newContext();
  const api = await mockAuthenticatedApi(context, { groups: ["urgencias", "institution_admin"] });
  const units = [
    { id: "unit-a", code: "SYN-A", institution_id: "demo-operator-id", institution_name: "Hospital Operador Demo", enabled: true, can_deactivate: true },
    { id: "unit-b", code: "SYN-B", institution_id: "demo-operator-id", institution_name: "Hospital Operador Demo", enabled: true, can_deactivate: true },
    { id: "unit-old", code: "SYN-OLD", institution_id: "demo-operator-id", institution_name: "Hospital Operador Demo", enabled: false, can_deactivate: true },
    { id: "unit-foreign", code: "SYN-FOREIGN", institution_id: "foreign", institution_name: "Otra institución", enabled: true, can_deactivate: false },
  ];
  const account = { id: "200", username: "synthetic_unit_operator", email: "unit@example.test", groups: ["ambulance"], active: true, institution_id: "demo-operator-id", institution_name: "Hospital Operador Demo", ambulance: units[0] };
  api.managedAccounts.push(account);
  const writes = [];
  let reject = false;
  let loseResponse = false;
  await context.route("**/api/v1/institutions/management/ambulances/**", async (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: units });
    const id = new URL(route.request().url()).pathname.split("/").at(-3);
    writes.push({ type: "deactivate", id });
    units.find((unit) => unit.id === id).enabled = false;
    return route.fulfill({ status: 204 });
  });
  await context.route("**/api/v1/institutions/management/accounts/*/assignment/", async (route) => {
    const body = route.request().postDataJSON();
    writes.push(body);
    assert.deepEqual(Object.keys(body).sort(), ["ambulance_id", "expected_ambulance_id"]);
    if (reject) return route.fulfill({ status: 400, json: { code: "validation_error", message: "Último operador con episodios activos.", fields: {} } });
    assert.equal(body.expected_ambulance_id, account.ambulance?.id ?? null);
    account.ambulance = units.find((unit) => unit.id === body.ambulance_id) ?? null;
    if (loseResponse) return route.abort("failed");
    return account.ambulance ? route.fulfill({ json: account.ambulance }) : route.fulfill({ status: 204 });
  });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  page.on("dialog", (dialog) => dialog.accept());
  await page.goto(process.env.BASE_URL || "http://localhost:5173");
  await page.getByLabel("Usuario").fill("synthetic_admin");
  await page.getByLabel("Contraseña").fill("local-test-password");
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await page.getByRole("button", { name: "Administración", exact: true }).click();
  await page.getByRole("button", { name: "Historial de cuentas" }).click();
  const row = page.getByRole("listitem").filter({ hasText: account.username });
  const selector = row.getByRole("combobox");
  await selector.waitFor();
  assert.deepEqual(await selector.locator("option").evaluateAll((options) => options.map((option) => option.value)), ["", "unit-a", "unit-b"]);
  reject = true;
  await row.getByRole("button", { name: "Retirar unidad" }).click();
  await page.getByRole("alert").filter({ hasText: "Último operador" }).waitFor();
  assert.equal(account.ambulance.id, "unit-a");
  reject = false;
  await row.getByRole("button", { name: "Retirar unidad" }).click();
  await page.getByRole("status").filter({ hasText: "Unidad retirada" }).waitFor();
  assert.equal(account.ambulance, null);
  await selector.selectOption("unit-b");
  await page.getByRole("status").filter({ hasText: "Unidad asignada" }).waitFor();
  assert.equal(account.ambulance.id, "unit-b");
  await page.getByRole("button", { name: "Unidades de ambulancia" }).click();
  await page.getByRole("button", { name: "Desactivar SYN-A", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Unidad desactivada" }).waitFor();
  assert.equal(units[0].enabled, false);
  assert.equal(await page.getByRole("button", { name: "Desactivar SYN-FOREIGN", exact: true }).count(), 0);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  assert.equal(writes.length, 4);
  if (process.env.UNITS_SCREENSHOT) await page.screenshot({ path: process.env.UNITS_SCREENSHOT, fullPage: true });
  await page.getByRole("button", { name: "Historial de cuentas" }).click();
  loseResponse = true;
  await row.getByRole("button", { name: "Retirar unidad" }).click();
  await page.getByRole("button", { name: "Actualizar administración", exact: true }).waitFor();
  assert.equal(account.ambulance, null, "el servidor puede confirmar aunque se pierda la respuesta");
  assert.equal(await selector.isDisabled(), true);
  assert.equal(writes.length, 5, "no se reenvía automáticamente");
  loseResponse = false;
  await page.getByRole("button", { name: "Actualizar administración", exact: true }).click();
  await page.waitForFunction(() => !document.querySelector("fieldset[disabled]"));
  assert.equal(await selector.inputValue(), "");

  // Start with a new module (valid session, no cached CSRF), then log out while
  // an administration write is waiting for its CSRF response.
  await page.reload();
  await page.getByRole("button", { name: "Administración", exact: true }).click();
  await page.getByRole("button", { name: "Historial de cuentas" }).click();
  let release;
  let started;
  const waiting = new Promise((resolve) => { release = resolve; });
  const received = new Promise((resolve) => { started = resolve; });
  let csrfCalls = 0;
  await context.route("**/api/v1/auth/csrf/", async (route) => {
    if (++csrfCalls === 1) { started(); await waiting; }
    await route.fulfill({ json: { csrf_token: "synthetic-csrf" } });
  });
  await selector.selectOption("unit-b");
  await received;
  await page.getByRole("button", { name: "Cerrar sesión" }).click();
  await page.getByRole("button", { name: "Iniciar sesión" }).waitFor();
  const finished = page.waitForResponse((response) => response.url().endsWith("/auth/csrf/"));
  release();
  await (await finished).finished();
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert.equal(writes.length, 5, "una escritura del panel desmontado no puede salir tras logout");
  console.log("✓ Respuesta perdida sin reenvío, reconciliación explícita y escritura en espera CSRF cancelada por logout");
  console.log("✓ Retiro rechazado y aceptado, reasignación sin unidad, filtro institucional/inactivas y baja confirmada; móvil sin desborde (mock sintético)");
  await context.close();
} finally {
  await browser.close();
}
