import assert from "node:assert/strict";
import { test } from "node:test";
import { chromium } from "playwright";
import { mockAuthenticatedApi } from "./mock-auth-api.mjs";

test("institution address is resolved once and confirmation is bound to the displayed candidate", async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  try {
    await mockAuthenticatedApi(context, { groups: ["system_admin"] });
    let lookups = 0, selection;
    await context.route("**/api/v1/system/geocoding/", async (route) => {
      lookups++;
      assert.equal(route.request().postDataJSON().address, "Dirección sintética 123");
      await route.fulfill({ json: { lookup_id: "lookup-synthetic", status: "ready", candidates: [{ latitude: -33.45, longitude: -70.66, formatted: "Dirección sintética encontrada", result_type: "building", confidence: 1 }] } });
    });
    await context.route("**/api/v1/system/institutions/", async (route, next) => {
      if (route.request().method() !== "POST") return route.fallback();
      selection = route.request().postDataJSON().location_selection;
      return route.fulfill({ status: 201, json: { id: "synthetic", first_account: { username: "nuevo" } } });
    });
    const page = await context.newPage();
    await page.goto(process.env.BASE_URL || "http://127.0.0.1:5174/");
    await page.getByLabel("Usuario", { exact: true }).fill("synthetic_admin");
    await page.getByLabel("Contraseña", { exact: true }).fill("synthetic-password");
    await page.getByRole("button", { name: "Iniciar sesión", exact: true }).click();
    await page.getByRole("button", { name: "Nueva institución", exact: true }).click();
    await page.getByLabel("Nombre institución", { exact: true }).fill("Hospital Sintético");
    await page.getByLabel(/^RUT empresa/).fill("761251856");
    await page.getByLabel("Dirección", { exact: true }).fill("Dirección sintética 123");
    await page.getByLabel("Correo de contacto", { exact: true }).fill("institution@example.test");
    await page.getByLabel("Nombre de usuario", { exact: true }).fill("nuevo");
    await page.getByLabel("Correo de activación", { exact: true }).fill("nuevo@example.test");
    await page.getByRole("button", { name: "Crear institución y enviar activación", exact: true }).click();
    await page.getByText("Dirección sintética encontrada", { exact: false }).waitFor();
    assert.equal(selection, undefined);
    await page.getByRole("radio", { name: /Dirección sintética encontrada/ }).check();
    await page.getByRole("button", { name: "Crear institución y enviar activación", exact: true }).click();
    await page.getByRole("status").filter({ hasText: "Institución creada" }).waitFor();
    assert.deepEqual(selection, { lookup_id: "lookup-synthetic", index: 0 });
    assert.equal(lookups, 1);
  } finally { await context.close(); await browser.close(); }
});

test("a late geocoding result cannot populate a different institution form", async () => {
  const browser = await chromium.launch(), context = await browser.newContext(); let release;
  try {
    await mockAuthenticatedApi(context, { groups: ["system_admin"] });
    const held = new Promise((resolve) => { release = resolve; });
    await context.route("**/api/v1/system/geocoding/", async (route) => {
      await held;
      return route.fulfill({ json: { lookup_id: "old", status: "ready", candidates: [{ latitude: -33, longitude: -70, formatted: "Ubicación vieja sintética" }] } });
    });
    const page = await context.newPage(); page.setDefaultTimeout(10000);
    await page.goto(process.env.BASE_URL || "http://127.0.0.1:5174/");
    await page.getByLabel("Usuario", { exact: true }).fill("synthetic_admin");
    await page.getByLabel("Contraseña", { exact: true }).fill("synthetic-password");
    await page.getByRole("button", { name: "Iniciar sesión", exact: true }).click();
    await page.getByRole("button", { name: "Nueva institución", exact: true }).click();
    await page.getByLabel("Nombre institución", { exact: true }).fill("Hospital Sintético");
    await page.getByLabel(/^RUT empresa/).fill("761251856");
    await page.getByLabel("Dirección", { exact: true }).fill("Dirección sintética vieja");
    await page.getByLabel("Correo de contacto", { exact: true }).fill("institution@example.test");
    await page.getByLabel("Nombre de usuario", { exact: true }).fill("nuevo");
    await page.getByLabel("Correo de activación", { exact: true }).fill("nuevo@example.test");
    const request = page.waitForRequest((r) => r.url().includes("/system/geocoding/"));
    await page.getByRole("button", { name: "Crear institución y enviar activación", exact: true }).click(); await request;
    await page.getByRole("button", { name: "Cerrar", exact: true }).click();
    await page.getByRole("button", { name: "Nueva institución", exact: true }).click();
    const response = page.waitForResponse((r) => r.url().includes("/system/geocoding/"));
    release(); await (await response).finished();
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.equal(await page.getByText(/Ubicación vieja sintética/).count(), 0);
    assert.equal(await page.getByLabel("Dirección", { exact: true }).inputValue(), "");
  } finally { release?.(); await context.close(); await browser.close(); }
});
