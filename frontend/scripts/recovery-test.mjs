import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { chromium } from "playwright";
import { mockAuthenticatedApi } from "./mock-auth-api.mjs";

let browser;
before(async () => { browser = await chromium.launch(); });
after(async () => { await browser.close(); });
const BASE = process.env.BASE_URL || "http://127.0.0.1:5174";
const id = "10000000-0000-4000-8000-000000000123";
const token = "synthetic_recovery_token_01234567890123456789";
const message = "Si la cuenta está disponible, recibirás instrucciones en su correo registrado.";

async function harness(groups = ["urgencias"]) {
  const context = await browser.newContext();
  await mockAuthenticatedApi(context, { groups });
  const state = { posts: [], failure: false, hold: null };
  await context.route("**/api/v1/auth/recovery/**", async (route) => {
    state.posts.push({ url: route.request().url(), body: route.request().postDataJSON() });
    if (state.hold) await state.hold;
    await route.fulfill(state.failure ? { status: 400, json: { code: "validation_error", message: "El enlace ya se usó o venció." } } : { status: route.request().url().includes("/request/") ? 202 : 200, json: route.request().url().includes("/request/") ? { message } : { recovered: true } });
  });
  const page = await context.newPage(); page.setDefaultTimeout(10000);
  await page.addInitScript(() => {
    window.WebSocket = class extends EventTarget {
      readyState = 0;
      constructor() { super(); window.syntheticSocket = this; }
      close() {}
    };
  });
  return { context, page, state };
}

test("forgot-password form sends one explicit generic request without account enumeration", async () => {
  const h = await harness();
  try {
    await h.page.goto(BASE);
    await h.page.getByRole("link", { name: "Olvidé mi contraseña", exact: true }).click();
    await h.page.getByLabel("Correo registrado", { exact: true }).fill("synthetic@example.test");
    await h.page.getByRole("button", { name: "Solicitar recuperación", exact: true }).click();
    await h.page.getByRole("status").filter({ hasText: message }).waitFor();
    assert.equal(h.state.posts.length, 1);
    assert.deepEqual(h.state.posts[0].body, { email: "synthetic@example.test" });
    assert.equal(await h.page.getByLabel("Contraseña", { exact: true }).count(), 0);
    await h.page.getByText(/soporte técnico/i).waitFor();
  } finally { await h.context.close(); }
});

for (const failure of [false, true]) test(`recovery fragment is erased and secrets remain volatile; failure=${failure}`, async () => {
  const h = await harness();
  try {
    h.state.failure = failure;
    await h.page.goto(`${BASE}/restablecer-cuenta#id=${id}&token=${token}`);
    await h.page.getByRole("heading", { name: "Restablecer contraseña", exact: true }).waitFor();
    assert.equal(new URL(h.page.url()).hash, "");
    assert.equal(h.state.posts.length, 0);
    await h.page.getByLabel("Nueva contraseña", { exact: true }).fill("Nueva frase sintética segura 2026!");
    await h.page.getByLabel("Repite la nueva contraseña", { exact: true }).fill("Nueva frase sintética segura 2026!");
    const response = h.page.waitForResponse((item) => item.url().includes("/auth/recovery/complete/"));
    await h.page.getByRole("button", { name: "Confirmar recuperación", exact: true }).click();
    await response;
    assert.equal(h.state.posts.length, 1);
    assert.equal(h.state.posts[0].body.id, id);
    assert.equal(h.state.posts[0].body.token, token);
    assert.equal(h.state.posts[0].url.includes(token), false);
    if (failure) {
      await h.page.getByRole("alert").waitFor();
      assert.equal(await h.page.getByLabel("Nueva contraseña", { exact: true }).inputValue(), "");
    } else {
      await h.page.getByRole("status").filter({ hasText: "Contraseña restablecida" }).waitFor();
      assert.equal(await h.page.getByLabel("Nueva contraseña", { exact: true }).count(), 0);
      await h.page.getByRole("link", { name: "Ir al inicio de sesión", exact: true }).waitFor();
    }
    assert.equal((await h.page.evaluate(() => JSON.stringify([localStorage, sessionStorage]))).includes(token), false);
    assert.equal(new URL(h.page.url()).pathname, "/restablecer-cuenta", "must not auto-login");
    await h.page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await h.page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    if (!failure && process.env.RECOVERY_SCREENSHOT) await h.page.screenshot({ path: process.env.RECOVERY_SCREENSHOT, fullPage: true });
  } finally { await h.context.close(); }
});

test("malformed or query-string recovery links do not send secrets or show a password form", async () => {
  const h = await harness();
  try {
    await h.page.goto(`${BASE}/restablecer-cuenta?id=${id}&token=${token}`);
    await h.page.getByRole("alert").waitFor();
    assert.equal(await h.page.getByLabel("Nueva contraseña", { exact: true }).count(), 0);
    assert.equal(h.state.posts.length, 0);
    assert.equal(new URL(h.page.url()).search, "");
  } finally { await h.context.close(); }
});

test("a different recovery link in the same tab discards the previous secret and password draft", async () => {
  const h = await harness();
  try {
    await h.page.goto(`${BASE}/restablecer-cuenta#id=${id}&token=${token}`);
    await h.page.getByLabel("Nueva contraseña", { exact: true }).fill("Borrador anterior que debe descartarse");
    const otherId = "10000000-0000-4000-8000-000000000124";
    const otherToken = "another_synthetic_recovery_token_012345678901";
    await h.page.evaluate((hash) => { window.location.hash = hash; }, `id=${otherId}&token=${otherToken}`);
    await h.page.waitForURL((url) => !url.hash);
    assert.equal(await h.page.getByLabel("Nueva contraseña", { exact: true }).inputValue(), "");
    await h.page.getByLabel("Nueva contraseña", { exact: true }).fill("Nueva frase sintética segura 2026!");
    await h.page.getByLabel("Repite la nueva contraseña", { exact: true }).fill("Nueva frase sintética segura 2026!");
    const response = h.page.waitForResponse((r) => r.url().includes("/recovery/complete/"));
    await h.page.getByRole("button", { name: "Confirmar recuperación", exact: true }).click(); await response;
    assert.equal(h.state.posts[0].body.id, otherId);
    assert.equal(h.state.posts[0].body.token, otherToken);
  } finally { await h.context.close(); }
});

test("administrator initiates recovery without receiving password link or new-email controls", async () => {
  const h = await harness(["urgencias", "institution_admin"]);
  try {
    let body;
    await h.context.route("**/api/v1/institutions/management/accounts/1/recovery/", (route) => { body = route.request().postDataJSON(); return route.fulfill({ status: 202, json: { message } }); });
    await h.page.goto(BASE);
    await h.page.getByLabel("Usuario", { exact: true }).fill("synthetic_admin");
    await h.page.getByLabel("Contraseña", { exact: true }).fill("synthetic-test-password");
    await h.page.getByRole("button", { name: "Iniciar sesión", exact: true }).click();
    await h.page.getByRole("button", { name: "Administración", exact: true }).click();
    await h.page.getByRole("button", { name: "Historial de cuentas", exact: true }).click();
    h.page.on("dialog", (dialog) => dialog.accept());
    await h.page.getByRole("button", { name: "Solicitar recuperación de demo_urgencias", exact: true }).click();
    await h.page.getByRole("status").filter({ hasText: /Recuperación solicitada/ }).waitFor();
    assert.deepEqual(body, {});
    assert.equal(await h.page.getByLabel("Correo nuevo", { exact: true }).count(), 0);
    await h.context.route("**/api/v1/auth/me/", (route) => route.fulfill({ status: 401, json: { code: "session_expired", message: "Sesión revocada." } }));
    await h.page.evaluate(() => window.syntheticSocket.dispatchEvent(new CloseEvent("close", { code: 4401 })));
    await h.page.getByRole("button", { name: "Iniciar sesión", exact: true }).waitFor();
  } finally { await h.context.close(); }
});

test("a late recovery response cannot replace the login after leaving the form", async () => {
  const h = await harness(); let release;
  try {
    h.state.hold = new Promise((resolve) => { release = resolve; });
    await h.page.goto(`${BASE}/restablecer-cuenta#id=${id}&token=${token}`);
    await h.page.getByLabel("Nueva contraseña", { exact: true }).fill("Nueva frase sintética segura 2026!");
    await h.page.getByLabel("Repite la nueva contraseña", { exact: true }).fill("Nueva frase sintética segura 2026!");
    const request = h.page.waitForRequest((r) => r.url().includes("/recovery/complete/"));
    await h.page.getByRole("button", { name: "Confirmar recuperación", exact: true }).click(); await request;
    await h.page.getByRole("link", { name: "Volver al inicio de sesión", exact: true }).click();
    await h.page.getByRole("button", { name: "Iniciar sesión", exact: true }).waitFor();
    const response = h.page.waitForResponse((r) => r.url().includes("/recovery/complete/"));
    release(); await (await response).finished();
    assert.equal(await h.page.getByText(/Contraseña restablecida/).count(), 0);
    assert.equal(h.state.posts.length, 1);
  } finally { release?.(); await h.context.close(); }
});
