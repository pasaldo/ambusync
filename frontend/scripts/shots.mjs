// Genera capturas de las pantallas principales para el README.
// Uso: con el dev server corriendo en http://localhost:5173 → node scripts/shots.mjs
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { mkdirSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, "../../docs/screenshots");
mkdirSync(OUT, { recursive: true });

const BASE = process.env.BASE_URL || "http://localhost:5173";
const VIEWPORT = { width: 820, height: 920 };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: VIEWPORT,
  deviceScaleFactor: 2, // capturas nítidas (retina)
  reducedMotion: "reduce", // congela animaciones → estado final limpio
});
const page = await ctx.newPage();

async function shot(name) {
  await page.screenshot({ path: resolve(OUT, name) });
  console.log("✓", name);
}

async function clickText(text) {
  await page.getByRole("button", { name: text, exact: false }).first().click();
}

// 1 — Selector de rol
await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
await sleep(500);
await shot("01-selector-rol.png");

// 2 — Inicio de la ambulancia
await page.goto(`${BASE}/ambulancia`, { waitUntil: "networkidle" });
await sleep(400);
await shot("02-ambulancia-inicio.png");

// 3 — Wizard: datos del paciente
await page.locator("button.group").first().click();
await page.waitForSelector("#cc", { state: "visible" });
await sleep(300);
await page.fill("#alias", "Paciente Bravo");
await page.fill("#age", "58");
await page.fill("#cc", "Dolor torácico opresivo");
for (const s of ["Disnea", "Sudoración"]) {
  try {
    await page.getByText(s, { exact: true }).click({ timeout: 3000 });
  } catch {
    /* chip opcional */
  }
}
await sleep(250);
await shot("03-wizard-paciente.png");

// 4 — Wizard: signos vitales
await clickText("Continuar");
await sleep(350);
const bump = async (label, n) => {
  for (let i = 0; i < n; i++) {
    await page.locator(`button[aria-label="Aumentar ${label}"]`).click();
    await sleep(90);
  }
};
await bump("FC", 44); // ~124 desde 80
await bump("SatO₂", 0);
await page.locator(`button[aria-label="Disminuir SatO₂"]`).click(); // 97 → 96... lo dejamos bajo
for (let i = 0; i < 8; i++) await page.locator(`button[aria-label="Disminuir SatO₂"]`).click();
await bump("PA sistólica", 0);
await page.locator(`button[aria-label="Disminuir PA sistólica"]`).click();
await bump("FR", 10);
await sleep(250);
await shot("04-wizard-vitales.png");

// 5 — Wizard: triage
await clickText("Continuar");
await sleep(350);
await page.getByText("Crítico", { exact: true }).click();
await sleep(250);
await shot("05-wizard-triage.png");

// 6 — Wizard: resumen
await clickText("Continuar"); // destino (defaults)
await sleep(300);
await clickText("Continuar"); // resumen
await sleep(350);
await shot("06-wizard-resumen.png");

// 7 — Confirmación de transmisión
await clickText("Transmitir al hospital");
await sleep(2200); // espera el pulso + estado "Transmitido"
await shot("07-transmision.png");

// 8 — Tablero de Urgencias (sembrado)
await page.goto(`${BASE}/urgencias`, { waitUntil: "networkidle" });
await sleep(700);
await shot("08-urgencias-tablero.png");

// 9 — Detalle del paciente
await page.locator("button.group").first().click();
await sleep(500);
await shot("09-urgencias-detalle.png");

await browser.close();
console.log("\nListo →", OUT);
