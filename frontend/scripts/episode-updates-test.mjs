import assert from "node:assert/strict";
import { chromium } from "playwright";
import { mockAuthenticatedApi } from "./mock-auth-api.mjs";

const browser = await chromium.launch();
const BASE = process.env.BASE_URL || "http://127.0.0.1:5174";
try {
  const context = await browser.newContext();
  await mockAuthenticatedApi(context);
  const episode = {
    id: "synthetic-episode-d", destination_name: "Hospital Central Demo", destination_id: "demo-hospital-id",
    ambulance_code: "SYN-01", status: "en_traslado", reason: "Motivo sintético D", notes: "Antecedente original", symptoms: [], triage: null,
    patient: { identity_unknown: true, alias: null, age_value: null, age_unit: null, recorded_sex: null },
    created_at: "2026-11-12T12:00:00Z", version: 1,
    vital_measurements: [{ id: "1", kind: "heart_rate", value: 70, unit: "lpm", measured_at: "2026-11-12T12:00:00Z", recorded_at: "2026-11-12T12:00:01Z", recorded_by_id: "synthetic-author", is_current: true, rectifies_id: null, rectified_by_id: null, rectification_reason: "" }],
  };
  const accepted = new Map();
  const bodies = [];
  let lose = false;
  let wrongEpisode = false;
  let expired = true;
  let expireWrite = false;
  const now = Date.now() / 1000;
  const user = { id: "synthetic-person-d", username: "synthetic_ambulance", groups: ["ambulance"], institutions: [{ id: "synthetic-operator", name: "Operadora sintética" }], ambulance: { id: "synthetic-unit-d", code: "SYN-01" }, session: { started_at: now, idle_expires_at: now + 1800, absolute_expires_at: now + 43200 } };
  await context.route("**/api/v1/auth/me/", (route) => route.fulfill(expired ? { status: 401, json: { code: "session_expired", message: "Sesión expirada." } } : { json: user }));
  await context.route("**/api/v1/auth/login/", (route) => { expired = false; return route.fulfill({ json: { ok: true } }); });
  await context.route("**/api/v1/emergencies/**", async (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: { count: 1, results: [episode], next: null, previous: null } });
    const body = route.request().postDataJSON();
    bodies.push(body);
    if (expireWrite) { expired = true; return route.fulfill({ status: 401, json: { code: "session_expired", message: "Sesión expirada." } }); }
    if (wrongEpisode) return route.fulfill({ json: { ...episode, id: "another-episode", version: episode.version + 1 } });
    if (!accepted.has(body.operation_id)) {
      assert.equal(body.expected_version, episode.version, "el borrador debe conservar su versión observada");
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith("/update/")) Object.assign(episode, { reason: body.reason ?? episode.reason, notes: body.notes ?? episode.notes, symptoms: body.symptoms ?? episode.symptoms, triage: body.triage ?? null });
      else {
        const rectify = path.endsWith("/rectify/");
        const original = rectify ? episode.vital_measurements.find((item) => item.id === body.measurement_id) : null;
        const next = { id: String(episode.vital_measurements.length + 1), kind: "heart_rate", value: rectify ? body.value : body.vitals.hr, unit: "lpm", measured_at: rectify ? body.measured_at : body.vitals.taken_at, recorded_at: new Date().toISOString(), recorded_by_id: user.id, operation_id: body.operation_id, rectifies_id: original?.id ?? null, rectified_by_id: null, is_current: true, rectification_reason: body.reason ?? "" };
        if (original) { original.is_current = false; original.rectified_by_id = next.id; }
        episode.vital_measurements.push(next);
      }
      episode.version += 1;
      accepted.set(body.operation_id, JSON.stringify(body));
    } else assert.equal(JSON.stringify(body), accepted.get(body.operation_id), "retry exacto, incluida captura/versión");
    if (lose) return route.abort("failed");
    return route.fulfill({ json: episode });
  });
  const page = await context.newPage();
  await page.addInitScript(() => {
    window.WebSocket = class extends EventTarget {
      static CONNECTING = 0; static OPEN = 1; static CLOSING = 2; static CLOSED = 3;
      readyState = 0;
      close() { this.readyState = 3; }
    };
  });
  page.setDefaultTimeout(10000);
  async function login() {
    await page.getByLabel("Usuario", { exact: true }).fill("synthetic_ambulance");
    await page.getByLabel("Contraseña", { exact: true }).fill("synthetic-password");
    await page.getByRole("button", { name: "Iniciar sesión" }).click();
  }
  await page.goto(BASE);
  await login();
  await page.getByRole("button", { name: "Episodios de la unidad", exact: true }).click();
  await page.getByRole("button", { name: "Actualizar antecedentes y mediciones" }).click();
  await page.getByLabel("Notas del episodio", { exact: true }).fill("Antecedente sintético actualizado");
  await page.getByLabel("Triaje del episodio", { exact: true }).selectOption("C2");
  await page.getByRole("button", { name: "Guardar antecedentes" }).click();
  await page.getByRole("status").filter({ hasText: "Antecedentes actualizados" }).waitFor();
  assert.equal(episode.triage, "C2");
  await page.getByLabel("Notas del episodio", { exact: true }).fill("Borrador no enviado mientras agrego medición");
  await page.getByLabel("Nuevo valor", { exact: true }).fill("90");
  await page.getByRole("button", { name: "Agregar medición", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Medición agregada" }).waitFor();
  assert.equal(episode.vital_measurements.length, 2);
  assert.equal(await page.getByLabel("Notas del episodio", { exact: true }).inputValue(), "Borrador no enviado mientras agrego medición", "guardar medición no descarta antecedentes sin enviar");
  assert.equal(episode.notes, "Antecedente sintético actualizado");
  await page.getByRole("button", { name: "Rectificar medición 1", exact: true }).click();
  await page.getByLabel("Nuevo valor", { exact: true }).fill("80");
  await page.getByLabel("Motivo de rectificación", { exact: true }).fill("Error sintético de digitación");
  await page.getByRole("button", { name: "Registrar rectificación", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Rectificación registrada" }).waitFor();
  assert.equal(episode.vital_measurements[0].value, 70);
  await page.getByText("Rectificada: reemplazo de 80 lpm (medición #3).", { exact: true }).waitFor();
  await page.getByText("Error sintético de digitación", { exact: true }).waitFor();
  lose = true;
  await page.getByLabel("Notas del episodio", { exact: true }).fill("Cambio con respuesta perdida");
  await page.getByRole("button", { name: "Guardar antecedentes" }).click();
  await page.getByRole("button", { name: "Reintentar operación", exact: true }).waitFor();
  assert.equal(await page.getByLabel("Notas del episodio", { exact: true }).isDisabled(), true);
  lose = false;
  await page.getByRole("button", { name: "Reintentar operación", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Operación confirmada" }).waitFor();
  assert.deepEqual(bodies.at(-1), bodies.at(-2));
  await page.getByLabel("Notas del episodio", { exact: true }).fill("Borrador con versión anterior");
  episode.version += 1;
  episode.notes = "Cambio de otro operador";
  await page.getByRole("button", { name: "Actualizar", exact: true }).click();
  await page.getByText(/El episodio cambió mientras editabas/).waitFor();
  assert.equal(await page.getByLabel("Notas del episodio", { exact: true }).inputValue(), "Borrador con versión anterior");
  assert.equal(await page.getByRole("button", { name: "Guardar antecedentes" }).isDisabled(), true);
  await page.getByRole("button", { name: "Cargar versión actual" }).click();
  assert.equal(await page.getByLabel("Notas del episodio", { exact: true }).inputValue(), "Cambio de otro operador");
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  if (process.env.UPDATES_SCREENSHOT) await page.screenshot({ path: process.env.UPDATES_SCREENSHOT, fullPage: true });

  expireWrite = true;
  await page.getByLabel("Notas del episodio", { exact: true }).fill("Borrador antes de reautenticación");
  await page.getByRole("button", { name: "Guardar antecedentes" }).click();
  await page.getByRole("button", { name: "Iniciar sesión" }).waitFor();
  expireWrite = false;
  await login();
  await page.getByRole("button", { name: "Reintentar operación", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Operación confirmada" }).waitFor();
  assert.deepEqual(bodies.at(-1), bodies.at(-2));
  assert.equal(episode.notes, "Borrador antes de reautenticación");
  await page.getByRole("button", { name: "Episodios de la unidad", exact: true }).click();
  // Remount the editor after reauthentication, then reject an alien response.
  if (await page.getByRole("button", { name: "Actualizar antecedentes y mediciones" }).count()) await page.getByRole("button", { name: "Actualizar antecedentes y mediciones" }).click();
  wrongEpisode = true;
  await page.getByLabel("Notas del episodio", { exact: true }).fill("No confirmar otro episodio");
  await page.getByRole("button", { name: "Guardar antecedentes" }).click();
  await page.getByRole("button", { name: "Reintentar operación", exact: true }).waitFor();
  assert.equal(episode.notes, "Borrador antes de reautenticación");
  console.log("✓ Antecedentes/triaje, series/rectificación original preservado, retry exacto, versión vieja, reautenticación, respuesta ajena y móvil (mock sintético)");
  await context.close();
} finally { await browser.close(); }
