// Verifica la sincronización entre pestañas: una pestaña /ambulancia transmite
// y otra pestaña /urgencias lo recibe en vivo (BroadcastChannel + localStorage).
import { chromium } from "playwright";

const BASE = process.env.BASE_URL || "http://localhost:5173";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch();
const ctx = await browser.newContext(); // mismo contexto = comparten origen/BC/localStorage
const er = await ctx.newPage();
const amb = await ctx.newPage();

// Pestaña Urgencias (siembra demo)
await er.goto(`${BASE}/urgencias`, { waitUntil: "networkidle" });
await sleep(700);
const before = await er.locator("button.group").count();
console.log("Tarjetas en Urgencias al inicio:", before);

// Pestaña Ambulancia: completa el wizard y transmite
await amb.goto(`${BASE}/ambulancia`, { waitUntil: "networkidle" });
await sleep(400);
await amb.locator("button.group").first().click();
await amb.waitForSelector("#cc", { state: "visible" });
await amb.fill("#alias", "Paciente Sync");
await amb.fill("#cc", "Prueba de sincronización entre pestañas");
await amb.getByRole("button", { name: "Continuar" }).click();
await sleep(300);
// Vitales mínimas (clics con re-render entre medio)
await amb.locator('button[aria-label="Aumentar FC"]').click();
await sleep(120);
await amb.locator('button[aria-label="Aumentar SatO₂"]').click();
await sleep(120);
await amb.getByRole("button", { name: "Continuar" }).click();
await sleep(300);
await amb.getByText("Crítico", { exact: true }).click();
await amb.getByRole("button", { name: "Continuar" }).click(); // → destino
await sleep(250);
await amb.getByRole("button", { name: "Continuar" }).click(); // → resumen
await sleep(250);
await amb.getByRole("button", { name: "Transmitir al hospital" }).click();
console.log("Transmitido desde /ambulancia. Esperando en /urgencias…");

// La pestaña de Urgencias debe mostrar al nuevo paciente SIN recargar.
// (El botón Transmitir corre el pulso ~1600ms antes de crear el caso.)
await sleep(2800);
const appeared = await er
  .getByText("Paciente Sync", { exact: false })
  .first()
  .isVisible()
  .catch(() => false);
const after = await er.locator("button.group").count();

console.log("Tarjetas en Urgencias después:", after);
console.log(appeared ? "✓ El caso apareció en vivo en la otra pestaña" : "✗ NO apareció");

await er.screenshot({ path: "../docs/screenshots/_sync-er.png" });
await browser.close();
process.exit(appeared && after > before ? 0 : 1);
