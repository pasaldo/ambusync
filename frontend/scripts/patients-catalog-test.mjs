import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { chromium } from "playwright";
import { mockAuthenticatedApi, historyFixture } from "./mock-auth-api.mjs";

let browser;
const BASE = process.env.BASE_URL || "http://127.0.0.1:5174";
before(async () => { browser = await chromium.launch(); });
after(async () => { await browser.close(); });

async function harness() {
  const context = await browser.newContext(); await mockAuthenticatedApi(context);
  const now = Date.now() / 1000;
  const user = { id: "synthetic-g-actor", username: "synthetic_g", groups: ["ambulance", "manage_symptoms"], institutions: [{ id: "operator-g", name: "Operadora G sintética" }], ambulance: { id: "unit-g", code: "SYN-G" }, session: { started_at: now, idle_expires_at: now + 1800, absolute_expires_at: now + 43200 } };
  const patient = { id: "10000000-0000-4000-8000-000000000201", enabled: true, version: 1, patient: { identity_unknown: false, alias: "Alias sintético inicial G", age_value: 8, age_unit: "months", recorded_sex: null } };
  const symptoms = [{ id: "symptom-g-base", institution_id: "operator-g", description: "Disnea", enabled: true, version: 1 }];
  const state = { expired: false, expireNext: false, loseNext: false, alienNext: false, posts: [], episodes: [], accepted: new Map(), patientReads: 0 };
  await context.route("**/api/v1/auth/me/", (route) => route.fulfill(state.expired ? { status: 401, json: { code: "session_expired", message: "Sesión expirada." } } : { json: user }));
  await context.route("**/api/v1/auth/login/", (route) => { state.expired = false; return route.fulfill({ json: { ok: true } }); });
  await context.route("**/api/v1/patients/**", async (route) => {
    if (route.request().method() === "GET") { state.patientReads += 1; return route.fulfill({ json: { results: patient.enabled ? [patient] : [], count: patient.enabled ? 1 : 0, next: null } }); }
    const body = route.request().postDataJSON(); state.posts.push({ path: new URL(route.request().url()).pathname, body });
    if (state.expireNext) { state.expireNext = false; state.expired = true; return route.fulfill({ status: 401, json: { code: "session_expired", message: "Sesión expirada." } }); }
    if (!state.accepted.has(body.operation_id)) {
      assert.equal(body.expected_version, patient.version);
      Object.assign(patient.patient, { identity_unknown: body.patient_identity_unknown, alias: body.patient_alias || null, age_value: body.age_value ?? null, age_unit: body.age_unit || null, recorded_sex: body.recorded_sex ?? null });
      patient.version += 1; state.accepted.set(body.operation_id, JSON.stringify(body));
    } else assert.equal(JSON.stringify(body), state.accepted.get(body.operation_id));
    if (state.loseNext) { state.loseNext = false; return route.abort("failed"); }
    if (state.alienNext) { state.alienNext = false; return route.fulfill({ json: { ...patient, id: "10000000-0000-4000-8000-000000000299" } }); }
    return route.fulfill({ json: patient });
  });
  await context.route("**/api/v1/institutions/symptoms/**", async (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: { count: symptoms.length, results: symptoms, next: null } });
    const body = route.request().postDataJSON(); state.posts.push({ path: new URL(route.request().url()).pathname, body });
    if (route.request().url().endsWith("/deactivate/")) { const symptom = symptoms.find((item) => route.request().url().includes(item.id)); symptom.enabled = false; symptom.version += 1; return route.fulfill({ json: symptom }); }
    const symptom = { id: "symptom-g-new", institution_id: "operator-g", description: body.description, enabled: true, version: 1 };
    symptoms.push(symptom); return route.fulfill({ status: 201, json: symptom });
  });
  await context.route("**/api/v1/emergencies/**", async (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: { results: state.episodes, next: null, count: state.episodes.length } });
    const body = route.request().postDataJSON(); state.posts.push({ path: new URL(route.request().url()).pathname, body });
    assert.equal(body.patient_id, patient.id); assert.equal(body.patient_version, patient.version);
    for (const field of ["patient_identity_unknown", "patient_alias", "age_value", "age_unit", "recorded_sex"]) assert.equal(field in body, false, "master selection cannot override snapshot");
    const episode = { id: `episode-g-${state.episodes.length}`, patient_id: patient.id, patient_record_version: patient.version, patient_record_enabled: true, patient: structuredClone(patient.patient), destination_id: "demo-hospital-id", destination_name: "Hospital Central Demo", ambulance_code: "SYN-G", version: 1, status: "notificada", created_at: new Date().toISOString(), reason: body.reason, symptoms: body.symptoms, notes: body.notes ?? "", vital_measurements: [], triage: null };
    state.episodes.push(episode); return route.fulfill({ status: 201, json: episode });
  });
  const page = await context.newPage(); page.setDefaultTimeout(10000);
  await page.addInitScript(() => { window.WebSocket = class extends EventTarget { static CONNECTING = 0; static OPEN = 1; static CLOSING = 2; static CLOSED = 3; readyState = 0; close() { this.readyState = 3; } }; });
  await page.goto(`${BASE}/local`);
  async function panel() { await page.getByRole("button", { name: "Pacientes y catálogo", exact: true }).click(); }
  async function edit() { await panel(); await page.getByLabel("Registro del paciente", { exact: true }).selectOption(patient.id); await page.getByLabel("Alias del registro", { exact: true }).fill("Alias sintético corregido G"); }
  async function login() { await page.getByLabel("Usuario", { exact: true }).fill("synthetic_g"); await page.getByLabel("Contraseña", { exact: true }).fill("synthetic-password"); await page.getByRole("button", { name: "Iniciar sesión" }).click(); await page.getByRole("heading", { name: "synthetic_g" }).waitFor(); }
  return { context, page, patient, user, symptoms, state, panel, edit, login };
}

test("patient pickers filter locally by alias or ID without selecting or submitting", async () => {
  const h = await harness();
  try {
    const search = h.page.getByLabel("Buscar paciente de la unidad por alias o ID", { exact: true });
    const select = h.page.getByLabel("Paciente de la unidad", { exact: true });
    await search.fill("  ALIAS SINTETICO  ");
    assert.equal(await select.locator("option").count(), 2);
    assert.equal(await select.inputValue(), "");
    await search.press("Enter");
    assert.equal(h.state.posts.length, 0);
    await select.selectOption(h.patient.id);
    await search.fill("ninguna coincidencia");
    await h.page.getByText("Sin coincidencias para esta búsqueda.", { exact: true }).waitFor();
    assert.equal(await select.inputValue(), h.patient.id);
    assert.match(await select.locator("option:checked").textContent(), /fuera del filtro/);
    await search.fill(h.patient.id.slice(-8));
    assert.doesNotMatch(await select.locator("option:checked").textContent(), /fuera del filtro/);
    await h.panel();
    const records = h.page.getByLabel("Registro del paciente", { exact: true });
    await h.page.getByLabel("Buscar registro por alias o ID", { exact: true }).fill(h.patient.id);
    await records.selectOption(h.patient.id);
    await h.page.getByLabel("Alias del registro", { exact: true }).fill("Borrador conservado");
    await h.page.getByLabel("Buscar registro por alias o ID", { exact: true }).fill("sin resultados");
    assert.equal(await h.page.getByLabel("Alias del registro", { exact: true }).inputValue(), "Borrador conservado");
    assert.equal(h.state.posts.length, 0);
  } finally { await h.context.close(); }
});

test("patient search and record selection reset after scope change", async () => {
  const h = await harness();
  try {
    await h.edit();
    await h.page.getByLabel("Buscar registro por alias o ID", { exact: true }).fill("sintético");
    await h.page.getByLabel("Buscar paciente de la unidad por alias o ID", { exact: true }).fill("inicial");
    h.state.expireNext = true;
    await h.page.getByRole("button", { name: "Guardar registro del paciente", exact: true }).click();
    await h.page.getByRole("button", { name: "Iniciar sesión", exact: true }).waitFor();
    h.user.ambulance.id = "unit-new-scope";
    await h.login();
    assert.equal(await h.page.getByLabel("Buscar paciente de la unidad por alias o ID", { exact: true }).inputValue(), "");
    await h.panel();
    assert.equal(await h.page.getByLabel("Buscar registro por alias o ID", { exact: true }).inputValue(), "");
    assert.equal(await h.page.getByLabel("Registro del paciente", { exact: true }).inputValue(), "");
    assert.equal(await h.page.getByLabel("Alias del registro", { exact: true }).count(), 0);
  } finally { await h.context.close(); }
});

for (const fault of ["none", "lost", "corrupt"]) test(`episode identification correction is separate from master and visible at receiver fault=${fault}`, async () => {
  const h = await harness();
  try {
    await h.page.getByLabel("Paciente de la unidad", { exact: true }).selectOption(h.patient.id);
    await h.page.getByLabel(/Destino receptor/).selectOption("demo-hospital-id");
    await h.page.getByLabel(/Motivo de consulta/).fill("Episodio sintético para corrección de identificación");
    await h.page.getByRole("button", { name: "Guardar emergencia" }).click();
    await h.page.getByRole("status").filter({ hasText: "Episodio guardado" }).waitFor();
    let firstAttempt = null;
    await h.context.route("**/api/v1/emergencies/*/patient-context/", (route) => {
      const body = route.request().postDataJSON(); const episode = h.state.episodes[0];
      h.state.posts.push({ path: new URL(route.request().url()).pathname, body });
      if (firstAttempt) { assert.deepEqual(body, firstAttempt); return route.fulfill({ json: episode }); }
      firstAttempt = body;
      const previous = structuredClone(episode.patient);
      episode.patient = { identity_unknown: body.patient_identity_unknown, alias: body.patient_alias, age_value: body.age_value, age_unit: body.age_unit, recorded_sex: body.recorded_sex ?? null };
      episode.version += 1;
      episode.patient_context_corrections = [{ id: "1", previous_patient: previous, corrected_patient: structuredClone(episode.patient), reason: body.reason, recorded_by_id: h.user.id, recorded_at: new Date().toISOString(), operation_id: body.operation_id, episode_version: episode.version }];
      if (fault === "lost") return route.abort("failed");
      if (fault === "corrupt") return route.fulfill({ json: { ...episode, patient_context_corrections: [] } });
      return route.fulfill({ json: episode });
    });
    await h.page.getByRole("button", { name: "Episodios de la unidad", exact: true }).click();
    await h.page.getByRole("button", { name: "Corregir identificación de este episodio", exact: true }).click();
    await h.page.getByLabel("Alias de este episodio", { exact: true }).fill("Alias de episodio corregido");
    await h.page.getByLabel("Edad de este episodio", { exact: true }).fill("31");
    await h.page.getByLabel("Unidad de edad de este episodio", { exact: true }).selectOption("years");
    await h.page.getByLabel("Motivo de corrección de identificación", { exact: true }).fill("Corrección sintética de digitación");
    if (fault === "none" && process.env.PATIENT_CONTEXT_SCREENSHOT) {
      await h.page.setViewportSize({ width: 390, height: 844 });
      assert.equal(await h.page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await h.page.screenshot({ path: process.env.PATIENT_CONTEXT_SCREENSHOT, fullPage: true });
    }
    await h.page.getByRole("button", { name: "Guardar identificación de este episodio", exact: true }).click();
    if (fault !== "none") {
      await h.page.getByRole("button", { name: "Reintentar operación", exact: true }).waitFor();
      assert.equal(await h.page.getByLabel("Alias de este episodio", { exact: true }).isDisabled(), true);
      await h.page.getByRole("button", { name: "Reintentar operación", exact: true }).click();
      await h.page.getByRole("status").filter({ hasText: "Operación confirmada en el servidor" }).waitFor();
    } else await h.page.getByRole("status").filter({ hasText: "Identificación del episodio corregida" }).waitFor();
    assert.equal(h.patient.patient.alias, "Alias sintético inicial G");
    await h.page.getByText("Alias de episodio corregido", { exact: true }).first().waitFor();
    await h.page.getByText(/31 años/).first().waitFor();
    h.user.groups = ["urgencias"]; h.user.ambulance = null; h.user.institutions = [{ id: "demo-hospital-id", name: "Hospital Central Demo" }];
    await h.page.reload();
    await h.page.getByRole("button", { name: /Episodio sintético para corrección de identificación/ }).click();
    await h.page.getByRole("heading", { name: "Alias de episodio corregido", exact: true }).waitFor();
    await h.page.getByText(/31 años/).first().waitFor();
    await h.page.getByText("Historial de identificación de este episodio (1)", { exact: true }).click();
    await h.page.getByText("Corrección sintética de digitación", { exact: true }).waitFor();
    assert.equal(await h.page.getByRole("button", { name: "Corregir identificación de este episodio", exact: true }).count(), 0);
  } finally { await h.context.close(); }
});

test("unit patient reuse, master correction and institutional catalogue are explicit", async () => {
  const h = await harness();
  try {
    await h.page.getByLabel("Paciente de la unidad", { exact: true }).selectOption(h.patient.id);
    await h.page.getByLabel(/Destino receptor/).selectOption("demo-hospital-id");
    await h.page.getByLabel(/Motivo de consulta/).fill("Primer episodio sintético G");
    await h.page.getByRole("button", { name: "Guardar emergencia" }).click();
    await h.page.getByRole("status").filter({ hasText: "Episodio guardado" }).waitFor();
    await h.edit(); await h.page.getByRole("button", { name: "Guardar registro del paciente", exact: true }).click();
    await h.page.getByText("Registro del paciente actualizado; episodios anteriores conservados.", { exact: true }).waitFor();
    assert.equal(h.state.episodes[0].patient.alias, "Alias sintético inicial G");
    assert.equal(h.patient.patient.alias, "Alias sintético corregido G");
    await h.page.getByLabel("Descripción del síntoma", { exact: true }).fill("Síntoma sintético nuevo G");
    await h.page.getByRole("button", { name: "Agregar al catálogo", exact: true }).click();
    await h.page.getByText("Síntoma registrado en el catálogo institucional.", { exact: true }).waitFor();
    await h.page.getByRole("button", { name: "Desactivar síntoma Síntoma sintético nuevo G", exact: true }).click();
    await h.page.getByText("Síntoma desactivado; descripciones históricas conservadas.", { exact: true }).waitFor();
    assert.equal(h.symptoms.at(-1).enabled, false);
    await h.page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await h.page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    if (process.env.PATIENTS_SCREENSHOT) await h.page.screenshot({ path: process.env.PATIENTS_SCREENSHOT, fullPage: true });
  } finally { await h.context.close(); }
});

for (const fault of ["loseNext", "alienNext"]) test(`${fault} master response preserves immutable operation and requires explicit retry`, async () => {
  const h = await harness();
  try {
    await h.edit(); h.state[fault] = true;
    await h.page.getByRole("button", { name: "Guardar registro del paciente", exact: true }).click();
    await h.page.getByRole("button", { name: "Reintentar operación de registro", exact: true }).waitFor();
    assert.equal(await h.page.getByLabel("Alias del registro").isDisabled(), true);
    await h.page.getByRole("button", { name: "Reintentar operación de registro", exact: true }).click();
    await h.page.getByText("Operación de registro confirmada en servidor.", { exact: true }).waitFor();
    assert.deepEqual(h.state.posts[0], h.state.posts[1]);
  } finally { await h.context.close(); }
});

for (const changed of [false, true]) test(`resource attempt reauthentication is scope-bound changed=${changed}`, async () => {
  const h = await harness();
  try {
    await h.edit(); h.state.expireNext = true;
    await h.page.getByRole("button", { name: "Guardar registro del paciente", exact: true }).click();
    await h.page.getByRole("button", { name: "Iniciar sesión" }).waitFor();
    if (changed) h.user.ambulance.id = "different-unit-g";
    await h.login(); assert.equal(h.state.posts.length, 1, "login cannot resend");
    const retry = h.page.getByRole("button", { name: "Reintentar operación de registro", exact: true });
    if (changed) assert.equal(await retry.count(), 0);
    else { await retry.click(); await h.page.getByText("Operación de registro confirmada en servidor.", { exact: true }).waitFor(); assert.deepEqual(h.state.posts[0], h.state.posts[1]); }
  } finally { await h.context.close(); }
});

test("master draft preserves its observed version until explicit reload", async () => {
  const h = await harness();
  try {
    await h.edit();
    h.patient.version = 2; h.patient.patient.alias = "Alias corregido por otro operador";
    await h.page.getByRole("button", { name: "Actualizar pacientes y catálogo", exact: true }).click();
    await h.page.getByText(/El registro del paciente cambió/).waitFor();
    assert.equal(await h.page.getByLabel("Alias del registro").inputValue(), "Alias sintético corregido G");
    assert.equal(await h.page.getByRole("button", { name: "Guardar registro del paciente", exact: true }).isDisabled(), true);
    await h.page.getByRole("button", { name: "Cargar registro actual", exact: true }).click();
    assert.equal(await h.page.getByLabel("Alias del registro").inputValue(), "Alias corregido por otro operador");
    assert.equal(h.state.posts.length, 0);
  } finally { await h.context.close(); }
});

test("inactive symptom selection can be explicitly removed without losing the draft", async () => {
  const h = await harness();
  try {
    await h.page.getByLabel("Paciente de la unidad", { exact: true }).selectOption(h.patient.id);
    await h.page.getByLabel(/Destino receptor/).selectOption("demo-hospital-id");
    await h.page.getByLabel(/Motivo de consulta/).fill("Borrador sintético que debe conservarse");
    await h.page.getByLabel("Disnea", { exact: true }).check();
    await h.panel();
    await h.page.getByRole("button", { name: "Desactivar síntoma Disnea", exact: true }).click();
    await h.page.getByText("Síntoma desactivado; descripciones históricas conservadas.", { exact: true }).waitFor();
    await h.page.getByRole("button", { name: "Quitar selección inactiva Disnea", exact: true }).click();
    assert.equal(await h.page.getByLabel(/Motivo de consulta/).inputValue(), "Borrador sintético que debe conservarse");
    await h.page.getByRole("button", { name: "Guardar emergencia", exact: true }).click();
    await h.page.getByRole("status").filter({ hasText: "Episodio guardado" }).waitFor();
    const created = h.state.posts.find((entry) => entry.path === "/api/v1/emergencies/");
    assert.deepEqual(created.body.symptoms, []);
  } finally { await h.context.close(); }
});

test("receiver only sees episode snapshot and explicit deactivation, never master directory", async () => {
  const h = await harness();
  try {
    await h.page.getByLabel("Paciente de la unidad", { exact: true }).selectOption(h.patient.id);
    await h.page.getByLabel(/Destino receptor/).selectOption("demo-hospital-id");
    await h.page.getByLabel(/Motivo de consulta/).fill("Caso sintético de desactivación G");
    await h.page.getByRole("button", { name: "Guardar emergencia" }).click();
    await h.page.getByRole("status").filter({ hasText: "Episodio guardado" }).waitFor();
    const episode = h.state.episodes[0]; episode.status = "cerrada";
    h.user.groups = ["urgencias", "deactivate_patients"]; h.user.ambulance = null;
    h.user.institutions = [{ id: "demo-hospital-id", name: "Hospital Central Demo" }];
    await h.context.route("**/api/v1/emergencies/*/patient-deactivate/", (route) => {
      const body = route.request().postDataJSON(); assert.equal(body.expected_version, h.patient.version);
      h.patient.enabled = false; h.patient.version += 1;
      episode.patient_record_enabled = false; episode.patient_record_version = h.patient.version;
      return route.fulfill({ json: { id: h.patient.id, enabled: false, version: h.patient.version } });
    });
    const reads = h.state.patientReads;
    await h.context.route(`**/api/v1/emergencies/${episode.id}/`, (route) => route.fulfill({ json: episode }));
    await h.context.route("**/api/v1/emergencies/history/**", (route) => route.fulfill({ json: historyFixture([episode], route.request().url()) }));
    await h.page.reload();
    await h.page.getByRole("button", { name: "Archivo de Urgencias", exact: true }).click();
    await h.page.getByRole("button", { name: /Caso sintético de desactivación G/ }).click();
    assert.equal(h.state.patientReads, reads, "receiver never requests master directory");
    assert.equal(await h.page.getByRole("button", { name: "Pacientes y catálogo", exact: true }).count(), 0);
    h.page.on("dialog", (dialog) => dialog.accept());
    await h.page.getByRole("button", { name: "Desactivar paciente sintético", exact: true }).click();
    await h.page.getByText("Paciente sintético desactivado; historial conservado.", { exact: true }).waitFor();
    assert.equal(await h.page.getByRole("button", { name: "Desactivar paciente sintético", exact: true }).count(), 0);
    assert.equal(episode.patient.alias, "Alias sintético inicial G");
  } finally { await h.context.close(); }
});

test("known identity with no alias is not falsely labelled as an unidentified patient", async () => {
  const h = await harness();
  try {
    h.patient.patient.alias = null;
    await h.panel(); await h.page.getByRole("button", { name: "Actualizar pacientes y catálogo", exact: true }).click();
    await h.page.getByLabel("Paciente de la unidad", { exact: true }).selectOption(h.patient.id);
    await h.page.getByLabel(/Destino receptor/).selectOption("demo-hospital-id");
    await h.page.getByLabel(/Motivo de consulta/).fill("Identidad conocida sin alias informado");
    await h.page.getByRole("button", { name: "Guardar emergencia" }).click();
    await h.page.getByRole("status").filter({ hasText: "Episodio guardado" }).waitFor();
    await h.page.getByRole("button", { name: "Episodios de la unidad", exact: true }).click();
    await h.page.getByText("Alias no informado", { exact: true }).waitFor();
    assert.equal(h.state.episodes[0].patient.identity_unknown, false);
  } finally { await h.context.close(); }
});

test("changed or unavailable selected patient requires explicit review, not a misleading new-patient option", async () => {
  const h = await harness();
  try {
    await h.page.getByLabel("Paciente de la unidad", { exact: true }).selectOption(h.patient.id);
    await h.page.getByLabel(/Motivo de consulta/).fill("Conservar borrador al revisar paciente");
    await h.panel(); h.patient.version = 2;
    await h.page.getByRole("button", { name: "Actualizar pacientes y catálogo", exact: true }).click();
    await h.page.getByRole("button", { name: "Actualizar selección del paciente", exact: true }).click();
    assert.equal(h.state.posts.length, 0);
    h.patient.enabled = false;
    await h.page.getByRole("button", { name: "Actualizar pacientes y catálogo", exact: true }).click();
    await h.page.getByText("No hay pacientes activos registrados para esta unidad.", { exact: true }).waitFor();
    const select = h.page.getByLabel("Paciente de la unidad", { exact: true });
    assert.match(await select.locator("option:checked").textContent(), /Registro seleccionado no disponible/);
    await select.selectOption("");
    await h.page.getByLabel("Identidad desconocida", { exact: true }).waitFor();
    assert.equal(await h.page.getByLabel(/Motivo de consulta/).inputValue(), "Conservar borrador al revisar paciente");
  } finally { await h.context.close(); }
});
