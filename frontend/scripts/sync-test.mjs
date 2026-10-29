import { chromium } from "playwright";

const BASE = process.env.BASE_URL || "http://localhost:5173";
const browser = await chromium.launch();

try {
  const context = await browser.newContext();
  const er = await context.newPage();
  const ambulance = await context.newPage();

  await er.goto(`${BASE}/urgencias`, { waitUntil: "networkidle" });
  const cards = er.locator("button.group");
  await cards.first().waitFor({ state: "visible" });
  const before = await cards.count();
  console.log("Tarjetas en Urgencias al inicio:", before);

  await ambulance.goto(`${BASE}/ambulancia`, { waitUntil: "networkidle" });
  await ambulance.getByRole("button", { name: "Nueva emergencia" }).click();
  await ambulance.locator("#cc").waitFor({ state: "visible" });
  await ambulance.fill("#alias", "Paciente Sync");
  await ambulance.fill("#cc", "Prueba de sincronización entre pestañas");

  await ambulance.getByRole("button", { name: "Continuar" }).click();
  await ambulance.getByRole("heading", { name: "Signos vitales" }).waitFor({ state: "visible" });
  await ambulance.locator('button[aria-label="Aumentar FC"]').click();
  await ambulance.locator('button[aria-label="Aumentar SatO₂"]').click();

  await ambulance.getByRole("button", { name: "Continuar" }).click();
  await ambulance.getByRole("heading", { name: "Clasificación de triage" }).waitFor({ state: "visible" });
  await ambulance.getByText("Crítico", { exact: true }).click();

  await ambulance.getByRole("button", { name: "Continuar" }).click();
  await ambulance.getByRole("heading", { name: "Destino y ETA" }).waitFor({ state: "visible" });
  await ambulance.getByRole("button", { name: "Continuar" }).click();
  await ambulance.getByRole("heading", { name: "Resumen" }).waitFor({ state: "visible" });
  await ambulance.getByRole("button", { name: "Transmitir al hospital" }).click();

  await er.getByText("Paciente Sync", { exact: false }).first().waitFor({ state: "visible", timeout: 10000 });
  const after = await cards.count();
  console.log("Tarjetas en Urgencias después:", after);

  if (after <= before) throw new Error("La transmisión no agregó un caso al tablero");
  console.log("✓ El caso apareció en vivo en la otra pestaña");
} finally {
  await browser.close();
}
