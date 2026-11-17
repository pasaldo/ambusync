import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { chromium } from "playwright";
import { mockAuthenticatedApi } from "./mock-auth-api.mjs";

const BASE = process.env.BASE_URL || "http://127.0.0.1:5174";
const PASSWORD = "Synthetic-Activation-Password-26!";
let browser;
before(async () => { browser = await chromium.launch(); });
after(async () => { await browser.close(); });

async function harness() {
  const context = await browser.newContext();
  await mockAuthenticatedApi(context);
  const state = { posts: [], hold: null, response: { activated: true }, replied: null };
  await context.route("**/api/v1/auth/activate/", async (route) => {
    state.posts.push(route.request().postDataJSON());
    if (state.hold) await state.hold;
    await route.fulfill({ json: state.response });
    state.replied?.();
  });
  const page = await context.newPage(); page.setDefaultTimeout(6000);
  return { context, page, state };
}

async function fill(page) {
  await page.getByLabel("Contraseña (mínimo 15 caracteres)", { exact: true }).fill(PASSWORD);
  await page.getByLabel("Repite la contraseña", { exact: true }).fill(PASSWORD);
}

for (const separator of ["#", "?"]) test(`activation ${separator} retains credentials only in memory and uses existing POST contract`, async () => {
  const h = await harness();
  try {
    await h.page.goto(`${BASE}/activar-cuenta${separator}uid=123&token=synthetic-one-time-token`);
    await fill(h.page);
    assert.equal(new URL(h.page.url()).search, "");
    assert.equal(new URL(h.page.url()).hash, "");
    await h.page.getByRole("button", { name: "Definir contraseña y activar", exact: true }).click();
    await h.page.getByRole("status").filter({ hasText: "Cuenta activada" }).waitFor();
    assert.deepEqual(h.state.posts, [{ uid: "123", token: "synthetic-one-time-token", password: PASSWORD, password_confirmation: PASSWORD }]);
    assert.equal(await h.page.evaluate(() => JSON.stringify([localStorage, sessionStorage]).includes("synthetic-one-time-token")), false);
  } finally { await h.context.close(); }
});

for (const suffix of [
  "?uid=123#token=synthetic",
  "#uid=123&uid=456&token=synthetic",
  "?uid=123&token=first&token=second",
  "?uid=123&token=legacy#uid=456",
]) test(`activation refuses mixed or duplicate credentials: ${suffix}`, async () => {
  const h = await harness();
  try {
    await h.page.goto(`${BASE}/activar-cuenta${suffix}`);
    await h.page.getByRole("alert").filter({ hasText: /no contiene/ }).waitFor();
    assert.equal(await h.page.getByRole("button", { name: "Definir contraseña y activar", exact: true }).count(), 0);
    assert.equal(h.state.posts.length, 0);
  } finally { await h.context.close(); }
});

test("complete fragment takes precedence over legacy query without combining credentials", async () => {
  const h = await harness();
  try {
    await h.page.goto(`${BASE}/activar-cuenta?uid=legacy&token=old#uid=456&token=synthetic-fragment-token`);
    await fill(h.page);
    await h.page.getByRole("button", { name: "Definir contraseña y activar", exact: true }).click();
    await h.page.getByRole("status").filter({ hasText: "Cuenta activada" }).waitFor();
    assert.equal(h.state.posts.length, 1);
    assert.equal(h.state.posts[0].uid, "456");
    assert.equal(h.state.posts[0].token, "synthetic-fragment-token");
  } finally { await h.context.close(); }
});

test("new activation fragment in the same tab discards old passwords and late success", async () => {
  const h = await harness(); let release;
  try {
    await h.page.goto(`${BASE}/activar-cuenta#uid=123&token=synthetic-first-token`);
    await fill(h.page);
    h.state.hold = new Promise((resolve) => { release = resolve; });
    const sent = h.page.waitForRequest((r) => r.url().endsWith("/auth/activate/"));
    await h.page.getByRole("button", { name: "Definir contraseña y activar", exact: true }).click(); await sent;
    await h.page.evaluate(() => { window.location.hash = "uid=456&token=synthetic-second-token"; });
    const password = h.page.getByLabel("Contraseña (mínimo 15 caracteres)", { exact: true });
    await password.waitFor();
    await h.page.waitForFunction(() => document.querySelector('input[type="password"]')?.value === "");
    const replied = new Promise((resolve) => { h.state.replied = resolve; });
    release(); await replied;
    await h.page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.equal(await h.page.getByRole("status").filter({ hasText: "Cuenta activada" }).count(), 0);
    assert.equal(await password.inputValue(), "");
    await fill(h.page);
    await h.page.getByRole("button", { name: "Definir contraseña y activar", exact: true }).click();
    await h.page.getByRole("status").filter({ hasText: "Cuenta activada" }).waitFor();
    assert.deepEqual(h.state.posts.map(({ uid, token }) => ({ uid, token })), [
      { uid: "123", token: "synthetic-first-token" }, { uid: "456", token: "synthetic-second-token" },
    ]);
  } finally { release?.(); await h.context.close(); }
});

test("malformed activation acknowledgement cannot announce success or automatically resend", async () => {
  const h = await harness();
  try {
    h.state.response = {};
    await h.page.goto(`${BASE}/activar-cuenta#uid=123&token=synthetic-token`);
    await fill(h.page);
    await h.page.getByRole("button", { name: "Definir contraseña y activar", exact: true }).click();
    await h.page.getByRole("alert").waitFor();
    assert.equal(await h.page.getByRole("status").filter({ hasText: "Cuenta activada" }).count(), 0);
    assert.equal(h.state.posts.length, 1);
  } finally { await h.context.close(); }
});
