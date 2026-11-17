import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { chromium } from "playwright";
import { mockAuthenticatedApi } from "./mock-auth-api.mjs";
const BASE = process.env.BASE_URL;

async function fixture(run) {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  context.setDefaultTimeout(5000);
  const api = await mockAuthenticatedApi(context, { groups: ["system_admin"] });
  const page = await context.newPage();
  try {
    await run({ context, page, api, login: async () => {
      await page.goto(BASE);
      await page.getByLabel("Usuario").fill("synthetic_system_admin");
      await page.getByLabel("Contraseña").fill("synthetic-test-password");
      await page.getByRole("button", { name: "Iniciar sesión" }).click();
      await page.getByRole("heading", { name: "Instituciones", exact: true }).waitFor();
    } });
  } finally { await browser.close(); }
}

test("activation 503 with empty fields is visible despite unavailable geocoding", async () => {
  await fixture(async ({ context, page, login }) => {
    let posts = 0;
    await context.route("**/api/v1/system/geocoding/", route => route.fulfill({ json: { lookup_id: "", status: "unavailable", candidates: [] } }));
    await context.route("**/api/v1/system/institutions/", route => {
      if (route.request().method() !== "POST") return route.fallback();
      posts++;
      assert.equal(route.request().postDataJSON().location_selection, null);
      return route.fulfill({ status: 503, json: { code: "activation_delivery_unavailable",
        message: "No se pudo enviar la activación; no se creó la institución ni su cuenta.", fields: {} } });
    });
    await login();
    await page.getByRole("button", { name: "Nueva institución" }).click();
    for (const [label, value] of [["Nombre institución", "Hospital Sintetico"], ["RUT empresa", "76.125.185-6"],
      ["Dirección", "Calle sintetica 12"], ["Correo de contacto", "contact@example.invalid"],
      ["Nombre de usuario", "synthetic-first"], ["Correo de activación", "first@example.invalid"]]) {
      await page.getByLabel(label).fill(value);
    }
    await page.getByRole("button", { name: "Crear institución y enviar activación" }).click();
    await page.getByRole("alert").filter({ hasText: "no se creó la institución ni su cuenta" }).waitFor({ timeout: 5000 });
    assert.equal(posts, 1);
  });
});

test("first activation resend is confirmed once and uncertainty requires explicit refresh", async () => {
  await fixture(async ({ context, page, api, login }) => {
    api.managedInstitutions[0].can_resend_first_activation = true;
    api.managedInstitutions[0].mail_delivery_mode = "mailpit";
    let posts = 0;
    await context.route("**/resend-first-activation/", route => { posts++; return route.abort(); });
    await login();
    await page.getByText(/Los mensajes son temporales/).waitFor();
    if (process.env.MAILBOX_SHOTS) {
      mkdirSync(process.env.MAILBOX_SHOTS, { recursive: true });
      for (const width of [320, 390, 1280]) {
        await page.setViewportSize({ width, height: 900 });
        await page.screenshot({ path: join(process.env.MAILBOX_SHOTS, `mailbox-${width}.png`), fullPage: true });
        assert.equal(await page.locator("body").evaluate(el => el.scrollWidth > innerWidth), false);
      }
    }
    const button = page.getByRole("button", { name: "Reenviar primera activación" });
    assert.equal(await button.count(), 1);
    page.on("dialog", dialog => dialog.accept());
    await button.click();
    await page.getByRole("alert").filter({ hasText: "Actualiza las instituciones" }).waitFor();
    assert.equal(posts, 1);
    assert.ok(await button.isDisabled());
    await page.getByRole("button", { name: "Buscar instituciones" }).click();
    await button.waitFor();
    await page.waitForFunction(() => ![...document.querySelectorAll("button")].find(b=>b.textContent.includes("Reenviar primera activación"))?.disabled);
    assert.equal(posts, 1);
  });
});

test("capture success does not claim external mail delivery", async () => {
  await fixture(async ({ context, page, api, login }) => {
    api.managedInstitutions[0].can_resend_first_activation = true;
    api.managedInstitutions[0].mail_delivery_mode = "mailpit";
    await context.route("**/resend-first-activation/", route => route.fulfill({ status: 204 }));
    await login();
    page.on("dialog", dialog => dialog.accept());
    await page.getByRole("button", { name: "Reenviar primera activación" }).click();
    await page.getByRole("status").filter({ hasText: "capturada en el buzón de pruebas" }).waitFor();
    assert.equal(await page.locator("body").evaluate(el => el.scrollWidth > innerWidth), false);
  });
});
