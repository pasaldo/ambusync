import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { chromium } from "playwright";
import { mockAuthenticatedApi } from "./mock-auth-api.mjs";
const BASE = process.env.BASE_URL;

async function fixture(run, { institutional = false } = {}) {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  context.setDefaultTimeout(5000);
  const api = await mockAuthenticatedApi(context, { groups: institutional ? ["urgencias", "institution_admin"] : ["system_admin"] });
  const page = await context.newPage();
  try {
    await run({ context, page, api, login: async () => {
      await page.goto(BASE);
      await page.getByLabel("Usuario").fill(institutional ? "synthetic_admin" : "synthetic_system_admin");
      await page.getByLabel("Contraseña").fill("synthetic-test-password");
      await page.getByRole("button", { name: "Iniciar sesión" }).click();
      if (institutional) {
        await page.getByRole("button", { name: "Administración", exact: true }).click();
        await page.getByRole("heading", { name: "Cuentas de Hospital Central Demo" }).waitFor();
      } else await page.getByRole("heading", { name: "Instituciones", exact: true }).waitFor();
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

for (const action of ["edit", "new", "close"]) {
  test(`a lost dispatched resend stays uncertain across unrelated form action ${action}`, async () => {
    await fixture(async ({ context, page, api, login }) => {
      api.managedInstitutions[0].can_resend_first_activation = true;
      api.managedInstitutions[0].mail_delivery_mode = "mailpit";
      let release, dispatched, posts = 0;
      const held = new Promise(resolve => { release = resolve; });
      const posted = new Promise(resolve => { dispatched = resolve; });
      await context.route("**/resend-first-activation/", async route => {
        posts++; dispatched(); await held; await route.abort();
      });
      try {
        await login();
        page.on("dialog", dialog => dialog.accept());
        await page.getByRole("button", { name: "Reenviar primera activación" }).click();
        await posted;
        if (action === "edit") await page.locator("article").filter({ hasText: "Hospital Central Demo" }).getByRole("button", { name: "Editar" }).click();
        else {
          await page.getByRole("button", { name: "Nueva institución" }).click();
          if (action === "close") await page.getByRole("button", { name: "Cerrar", exact: true }).click();
        }
        release();
        await page.getByRole("alert").filter({ hasText: "Actualiza las instituciones" }).waitFor();
        const button = page.getByRole("button", { name: "Reenviar primera activación" });
        assert.ok(await button.isDisabled());
        if (action !== "close") await page.getByRole("button", { name: "Cerrar", exact: true }).click();
        assert.ok(await button.isDisabled(), "Closing the form must not clear resend uncertainty");
        await page.getByText("Reenvío sin confirmar. Actualiza las instituciones con Buscar.").waitFor();
        assert.equal(posts, 1);
        await page.getByRole("button", { name: "Buscar instituciones" }).click();
        await page.waitForFunction(() => ![...document.querySelectorAll("button")].find(b => b.textContent.includes("Reenviar primera activación"))?.disabled);
        assert.equal(posts, 1, "Refresh must not automatically resend");
      } finally { release(); }
    });
  });
}

test("institutional capture mode labels creation resend and managed recovery without promising delivery", async () => {
  await fixture(async ({ context, page, login }) => {
    await context.route("**/api/v1/institutions/management/accounts/*/recovery/",
      route => route.fulfill({ status: 202, json: { message: "Solicitud recibida." } }));
    await context.route("**/api/v1/institutions/management/config/", route => route.fulfill({ json: {
      institution_name: "Hospital Central Demo", delegable_groups: ["ambulance", "urgencias"],
      operator_institutions: [{ id: "demo-operator-id", name: "Hospital Operador Demo" }],
      can_create_accounts: true, mail_delivery_mode: "mailpit",
    } }));
    await login();
    await page.getByLabel("Nombre de usuario").fill("synthetic-mailbox-member");
    await page.getByLabel("Correo institucional o de prueba").fill("member@example.invalid");
    await page.getByLabel("Urgencias", { exact: true }).check();
    await page.getByRole("button", { name: "Crear y enviar activación" }).click();
    await page.getByRole("status").filter({ hasText: "Activación capturada en el buzón de pruebas" }).waitFor();
    await page.getByRole("button", { name: "Historial de cuentas" }).click();
    const member = page.locator("li").filter({ hasText: "synthetic-mailbox-member" });
    await member.getByRole("button", { name: "Reenviar activación" }).click();
    await page.getByRole("status").filter({ hasText: "Nueva activación capturada en el buzón de pruebas" }).waitFor();
    page.on("dialog", dialog => dialog.accept());
    await page.getByRole("button", { name: "Solicitar recuperación de demo_urgencias", exact: true }).click();
    await page.getByRole("status").filter({ hasText: "buzón de pruebas; no se enviarán correos reales" }).waitFor();
    if (process.env.MAILBOX_SHOTS) {
      mkdirSync(process.env.MAILBOX_SHOTS, { recursive: true });
      for (const width of [320, 1280]) {
        await page.setViewportSize({ width, height: 900 });
        await page.screenshot({ path: join(process.env.MAILBOX_SHOTS, `institutional-mailbox-${width}.png`), fullPage: true });
        assert.equal(await page.locator("body").evaluate(el => el.scrollWidth > innerWidth), false);
      }
    }
  }, { institutional: true });
});
