import { chromium } from "playwright";
import { mockAuthenticatedApi } from "./mock-auth-api.mjs";

const BASE = process.env.BASE_URL || "http://localhost:5173";
const browser = await chromium.launch();

try {
  const context = await browser.newContext();
  await mockAuthenticatedApi(context);
  const er = await context.newPage();
  // Direct demo URLs must redirect to the shared sign-in screen before authentication.
  await er.goto(`${BASE}/urgencias`, { waitUntil: "networkidle" });
  await er.getByLabel("Usuario").waitFor({ state: "visible" });
  if (!new URL(er.url()).pathname.endsWith("/")) {
    throw new Error("Una ruta demo sin sesión no redirigió al inicio de sesión");
  }

  await er.getByLabel("Usuario").fill("demo_ambulancia");
  await er.getByLabel("Contraseña").fill("local-test-password");
  await er.getByRole("button", { name: "Iniciar sesión" }).click();
  await er.getByRole("heading", { name: "Nueva emergencia" }).waitFor({ state: "visible" });
  if (await er.getByRole("button", { name: "Urgencias", exact: true }).count()) {
    throw new Error("La cuenta de ambulancia mostró un módulo no autorizado");
  }
  await er.getByRole("button", { name: "Abrir simulador demo" }).click();
  await er.locator("button.group").first().waitFor({ state: "visible" });
  const ambulance = er;

  const receiver = await context.newPage();
  await receiver.goto(`${BASE}/urgencias`, { waitUntil: "networkidle" });
  const cards = receiver.locator("button.group");
  await cards.first().waitFor({ state: "visible" });
  const before = await cards.count();
  console.log("Tarjetas en Urgencias al inicio:", before);

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

  await receiver.getByText("Paciente Sync", { exact: false }).first().waitFor({ state: "visible", timeout: 10000 });
  const after = await cards.count();
  console.log("Tarjetas en Urgencias después:", after);

  if (after <= before) throw new Error("La transmisión no agregó un caso al tablero");
  console.log("✓ El caso apareció en vivo en la otra pestaña");

  await er.goto(`${BASE}/local`, { waitUntil: "networkidle" });
  await er.getByRole("button", { name: "Cerrar sesión" }).click();
  await er.getByLabel("Usuario").waitFor({ state: "visible" });
  await receiver.goto(`${BASE}/local`, { waitUntil: "networkidle" });
  await receiver.getByLabel("Usuario").waitFor({ state: "visible" });
  await receiver.goto(`${BASE}/urgencias`, { waitUntil: "networkidle" });
  await receiver.getByLabel("Usuario").waitFor({ state: "visible" });
  console.log("✓ Cerrar sesión bloqueó también el acceso directo al simulador");
} finally {
  await browser.close();
}
