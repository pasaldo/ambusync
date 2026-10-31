import { chromium } from "playwright";
import { mockAuthenticatedApi } from "./mock-auth-api.mjs";

const BASE = process.env.BASE_URL || "http://localhost:5173";
const browser = await chromium.launch();

try {
  const context = await browser.newContext();
  const api = await mockAuthenticatedApi(context, { groups: ["institution_admin"] });
  const page = await context.newPage();

  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await page.getByLabel("Usuario").fill("synthetic_admin");
  await page.getByLabel("Contraseña").fill("local-test-password");
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await page.getByRole("heading", { name: "Cuentas de Hospital Central Demo" }).waitFor({ state: "visible" });

  await page.getByLabel("Nombre de usuario").fill("synthetic_operator_02");
  await page.getByLabel("Correo institucional o de prueba").fill("operator02@example.test");
  await page.getByLabel("Ambulancia", { exact: true }).check();
  await page.getByLabel("Institución operadora").selectOption("demo-operator-id");
  await page.getByLabel("Unidad asignada").selectOption("demo-ambulance-id");
  await page.getByRole("button", { name: "Crear y enviar activación" }).click();
  await page.getByRole("status").filter({ hasText: "Se envió un enlace de activación" }).waitFor({ state: "visible" });
  await page.getByText("synthetic_operator_02").first().waitFor({ state: "visible" });

  const created = api.managedAccounts[0];
  if (created.active || created.groups[0] !== "ambulance" || created.ambulance?.id !== "demo-ambulance-id" || created.institution_id !== "demo-operator-id") {
    throw new Error("La cuenta no quedó pendiente o sin el permiso/unidad solicitados");
  }

  await page.goto(`${BASE}/activar-cuenta?uid=synthetic-user-id&token=synthetic-one-time-token`, { waitUntil: "networkidle" });
  await page.getByLabel("Contraseña (mínimo 15 caracteres)").fill("Synthetic-Activation-Password-26!");
  await page.getByLabel("Repite la contraseña").fill("Synthetic-Activation-Password-26!");
  await page.getByRole("button", { name: "Definir contraseña y activar" }).click();
  await page.getByRole("status").filter({ hasText: "Cuenta activada" }).waitFor({ state: "visible" });

  const operatorContext = await browser.newContext();
  await mockAuthenticatedApi(operatorContext, { groups: ["ambulance", "institution_admin"], canCreateAccounts: false });
  const operatorPage = await operatorContext.newPage();
  await operatorPage.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await operatorPage.getByLabel("Usuario").fill("synthetic_admin");
  await operatorPage.getByLabel("Contraseña").fill("local-test-password");
  await operatorPage.getByRole("button", { name: "Iniciar sesión" }).click();
  await operatorPage.getByRole("button", { name: "Ambulancia" }).click();
  await operatorPage.getByRole("heading", { name: "Nueva emergencia" }).waitFor({ state: "visible" });
  if (await operatorPage.getByRole("heading", { name: "Episodios de la unidad" }).count()) {
    throw new Error("La lista de episodios ocupa la vista del formulario");
  }
  await operatorPage.getByRole("button", { name: "Episodios de la unidad" }).click();
  await operatorPage.getByRole("heading", { name: "Episodios de la unidad" }).waitFor({ state: "visible" });
  if (await operatorPage.getByRole("heading", { name: "Nueva emergencia" }).count()) {
    throw new Error("El formulario sigue visible en la vista de episodios");
  }
  await operatorPage.getByRole("button", { name: "Administración" }).click();
  await operatorPage.getByRole("status").filter({ hasText: "reservada al perfil administrativo de Urgencias" }).waitFor({ state: "visible" });
  if (await operatorPage.getByRole("button", { name: "Crear y enviar activación" }).count()) {
    throw new Error("El perfil demo de ambulancias muestra la creación de cuentas");
  }
  await operatorContext.close();

  const urgenciasContext = await browser.newContext();
  await mockAuthenticatedApi(urgenciasContext, { groups: ["urgencias"] });
  const urgenciasPage = await urgenciasContext.newPage();
  await urgenciasPage.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await urgenciasPage.getByLabel("Usuario").fill("synthetic_urgencias");
  await urgenciasPage.getByLabel("Contraseña").fill("local-test-password");
  await urgenciasPage.getByRole("button", { name: "Iniciar sesión" }).click();
  await urgenciasPage.getByRole("button", { name: /Prueba sintética de llegada/ }).click();
  await urgenciasPage.getByRole("button", { name: "Marcar como llegado a Urgencias" }).click();
  await urgenciasPage.getByText(/Llegada registrada:/).waitFor({ state: "visible" });
  await urgenciasPage.getByText(/Llegado a Urgencias/).waitFor({ state: "visible" });
  await urgenciasContext.close();

  console.log("✓ Admin de Urgencias crea cuentas; ambulancias no y Urgencias confirma llegada");
  await context.close();
} finally {
  await browser.close();
}
