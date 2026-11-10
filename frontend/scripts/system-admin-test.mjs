import { chromium } from "playwright";
import { mockAuthenticatedApi } from "./mock-auth-api.mjs";

const BASE = process.env.BASE_URL || "http://localhost:5173";
const browser = await chromium.launch();

try {
  const context = await browser.newContext();
  const api = await mockAuthenticatedApi(context, { groups: ["system_admin"] });
  const page = await context.newPage();

  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await page.getByLabel("Usuario").fill("synthetic_system_admin");
  await page.getByLabel("Contraseña").fill("local-test-password");
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await page.getByRole("heading", { name: "AmbuSync · Sistema" }).waitFor({ state: "visible" });
  await page.getByText("Hospital Central Demo").waitFor({ state: "visible" });
  await page.getByText("Hospital Inactivo Demo").waitFor({ state: "visible" });
  if (await page.getByLabel("Nombre institución").count()) {
    throw new Error("El formulario debe permanecer oculto hasta iniciar un alta o edición.");
  }
  if (await page.getByRole("button", { name: "Administración", exact: true }).count()) {
    throw new Error("El administrador global no debe entrar al módulo institucional.");
  }

  await page.getByRole("button", { name: "Nueva institución" }).click();
  await page.getByLabel("Nombre institución").fill("Hospital Sintético Nuevo");
  await page.getByLabel("RUT empresa").fill("76.125.185-9");
  await page.getByText("El dígito verificador no coincide; para esta base debe ser 6.").waitFor({ state: "visible" });
  await page.getByLabel("RUT empresa").fill("76.125.185");
  await page.getByLabel("Dirección").fill("Dirección sintética 321, Santiago");
  await page.getByLabel("Teléfono (opcional)").fill("+56 2 2000 0000");
  await page.getByLabel("Correo de contacto").fill("contacto-nuevo@example.test");
  await page.getByLabel("Nombre de usuario").fill("synthetic_first_admin");
  await page.getByLabel("Correo de activación").fill("first-admin@example.test");
  await page.getByRole("button", { name: "Crear institución y enviar activación" }).click();
  await page.getByRole("status").filter({ hasText: "Se envió la activación para synthetic_first_admin" }).waitFor({ state: "visible" });
  const createdCard = page.locator("article").filter({ hasText: "Hospital Sintético Nuevo" });
  await createdCard.waitFor({ state: "visible" });
  if (!api.managedInstitutions.some((item) => item.name === "Hospital Sintético Nuevo" && item.kind === "receiver" && item.rut === "76.125.185-6")) {
    throw new Error("La nueva institución no quedó registrada como receptora.");
  }

  await createdCard.getByRole("button", { name: "Editar" }).click();
  await page.getByLabel("Nombre institución").fill("Hospital Sintético Actualizado");
  await page.getByLabel("RUT empresa").fill("76.125.185");
  await page.getByRole("button", { name: "Guardar cambios" }).click();
  await page.getByRole("status").filter({ hasText: "Los datos de la institución se actualizaron" }).waitFor({ state: "visible" });
  const updatedCard = page.locator("article").filter({ hasText: "Hospital Sintético Actualizado" });
  await updatedCard.waitFor({ state: "visible" });
  if (api.managedInstitutions.find((item) => item.name === "Hospital Sintético Actualizado")?.rut !== "76.125.185-6") {
    throw new Error("La edición debe enviar el RUT con dígito verificador calculado.");
  }

  page.on("dialog", (dialog) => dialog.accept());
  await updatedCard.getByRole("button", { name: "Desactivar" }).click();
  await page.getByRole("status").filter({ hasText: "Institución desactivada" }).waitFor({ state: "visible" });
  const inactiveCard = page.locator("article").filter({ hasText: "Hospital Sintético Actualizado" });
  await inactiveCard.getByText("Inactiva", { exact: true }).waitFor({ state: "visible" });
  await inactiveCard.getByRole("button", { name: "Reactivar" }).click();
  await page.getByRole("status").filter({ hasText: "Institución reactivada" }).waitFor({ state: "visible" });
  await page.locator("article").filter({ hasText: "Hospital Sintético Actualizado" }).getByText("Activa", { exact: true }).waitFor({ state: "visible" });

  await page.goto(`${BASE}/local`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "AmbuSync · Sistema" }).waitFor({ state: "visible" });
  await context.close();
  console.log("✓ Admin global: alta, primera cuenta, edición, baja lógica, reactivación y aislamiento de vistas");
} finally {
  await browser.close();
}
