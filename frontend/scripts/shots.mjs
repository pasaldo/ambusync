// Genera capturas de las vistas actuales conectadas al backend local simulado.
// Uso: con el dev server corriendo en http://localhost:5173 → npm run shots
import { chromium } from "playwright";
import { mockAuthenticatedApi } from "./mock-auth-api.mjs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { mkdirSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, "../../docs/screenshots");
mkdirSync(OUT, { recursive: true });
const BASE = process.env.BASE_URL || "http://localhost:5173";
const VIEWPORT = { width: 820, height: 920 };
const browser = await chromium.launch();

async function screenshot(page, name, { fullPage = true } = {}) {
  await page.screenshot({ path: resolve(OUT, name), fullPage });
  console.log("✓", name);
}

async function loginLocal(page, username) {
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await page.getByLabel("Usuario").fill(username);
  await page.getByLabel("Contraseña").fill("local-test-password");
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await page.getByText("Backend local").waitFor({ state: "visible" });
}

try {
  const loginContext = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2, reducedMotion: "reduce" });
  await mockAuthenticatedApi(loginContext, { groups: ["ambulance"] });
  const loginPage = await loginContext.newPage();
  await loginPage.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await loginPage.getByLabel("Usuario").waitFor({ state: "visible" });
  await screenshot(loginPage, "01-inicio-sesion.png");
  await loginContext.close();

  const ambulanceContext = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2, reducedMotion: "reduce" });
  await mockAuthenticatedApi(ambulanceContext, { groups: ["ambulance"] });
  const ambulancePage = await ambulanceContext.newPage();
  await loginLocal(ambulancePage, "demo_ambulancia");
  await ambulancePage.getByRole("heading", { name: "Nueva emergencia" }).waitFor({ state: "visible" });
  await screenshot(ambulancePage, "02-ambulancia-inicio.png");
  await ambulancePage.getByLabel("Destino receptor").selectOption("demo-hospital-id");
  await ambulancePage.getByLabel("Motivo de consulta").fill("Dolor torácico opresivo");
  await ambulancePage.getByLabel("Identidad desconocida").uncheck();
  await ambulancePage.getByLabel("Alias").fill("Paciente sintético Bravo");
  await ambulancePage.getByLabel("Frecuencia cardíaca").fill("76");
  await ambulancePage.getByLabel("Presión sistólica").fill("120");
  await ambulancePage.getByLabel("Presión diastólica").fill("80");
  await ambulancePage.getByLabel("SpO₂").fill("98");
  await ambulancePage.getByLabel("Frecuencia respiratoria").fill("16");
  await ambulancePage.getByLabel("Temperatura").fill("36.7");
  await ambulancePage.getByLabel("Glasgow").fill("15");
  await screenshot(ambulancePage, "03-ingreso-episodio.png");
  await ambulancePage.getByLabel("Triaje (opcional)").selectOption("C3");
  await screenshot(ambulancePage, "04-vista-previa-vitales.png");
  await ambulancePage.getByRole("button", { name: "Episodios de la unidad" }).click();
  await ambulancePage.getByRole("heading", { name: "Episodios de la unidad" }).waitFor({ state: "visible" });
  await screenshot(ambulancePage, "05-episodios-unidad.png");
  await ambulanceContext.close();

  const urgenciasContext = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2, reducedMotion: "reduce" });
  await mockAuthenticatedApi(urgenciasContext, { groups: ["urgencias", "institution_admin"], includeUrgenciasQueue: true });
  const urgenciasPage = await urgenciasContext.newPage();
  await loginLocal(urgenciasPage, "synthetic_urgencias");
  await urgenciasPage.getByRole("heading", { name: "Episodios entrantes" }).waitFor({ state: "visible" });
  await screenshot(urgenciasPage, "06-urgencias-entrantes.png", { fullPage: false });
  await urgenciasPage.getByRole("button", { name: "Archivo de Urgencias" }).click();
  await urgenciasPage.getByRole("heading", { name: "Archivo de episodios" }).waitFor({ state: "visible" });
  await screenshot(urgenciasPage, "07-archivo-urgencias.png");
  await urgenciasPage.getByRole("button", { name: "Urgencias", exact: true }).click();
  await urgenciasPage.getByRole("button", { name: /Caso en traslado/ }).click();
  await urgenciasPage.getByRole("dialog", { name: "Detalle de episodio" }).waitFor({ state: "visible" });
  await screenshot(urgenciasPage, "08-detalle-episodio.png", { fullPage: false });
  await urgenciasPage.getByRole("button", { name: "Cerrar", exact: true }).click();
  await urgenciasPage.getByRole("button", { name: /Marcar como llegado/ }).first().click();
  await screenshot(urgenciasPage, "09-llegada-registrada.png", { fullPage: false });
  await urgenciasPage.getByRole("button", { name: "Administración" }).click();
  await urgenciasPage.getByRole("heading", { name: /Cuentas de/ }).waitFor({ state: "visible" });
  await screenshot(urgenciasPage, "10-administracion-cuentas.png");
  await urgenciasPage.getByRole("button", { name: "Historial de cuentas" }).click();
  await screenshot(urgenciasPage, "11-administracion-historial.png");
  await urgenciasPage.getByRole("button", { name: "Unidades de ambulancia" }).click();
  await screenshot(urgenciasPage, "12-administracion-unidades.png");
  await urgenciasContext.close();

  const systemContext = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2, reducedMotion: "reduce" });
  await mockAuthenticatedApi(systemContext, { groups: ["system_admin"] });
  const systemPage = await systemContext.newPage();
  await systemPage.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await systemPage.getByLabel("Usuario").fill("synthetic_system_admin");
  await systemPage.getByLabel("Contraseña").fill("local-test-password");
  await systemPage.getByRole("button", { name: "Iniciar sesión" }).click();
  await systemPage.getByRole("heading", { name: "AmbuSync · Sistema" }).waitFor({ state: "visible" });
  await screenshot(systemPage, "13-administracion-global-instituciones.png");
  await systemContext.close();
} finally {
  await browser.close();
}
console.log("\nListo →", OUT);
