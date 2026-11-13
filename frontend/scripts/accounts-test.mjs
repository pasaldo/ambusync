import { chromium } from "playwright";
import { mockAuthenticatedApi } from "./mock-auth-api.mjs";

const BASE = process.env.BASE_URL || "http://localhost:5173";
const browser = await chromium.launch();

try {
  const context = await browser.newContext();
  const api = await mockAuthenticatedApi(context, { groups: ["urgencias", "institution_admin"] });
  const page = await context.newPage();

  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await page.getByLabel("Usuario").fill("synthetic_admin");
  await page.getByLabel("Contraseña").fill("local-test-password");
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await page.getByRole("button", { name: "Administración" }).click();
  await page.getByRole("heading", { name: "Cuentas de Hospital Central Demo" }).waitFor({ state: "visible" });

  await page.getByLabel("Nombre de usuario").fill("synthetic_operator_02");
  await page.getByLabel("Correo institucional o de prueba").fill("operator02@example.test");
  await page.getByLabel("Ambulancia", { exact: true }).check();
  await page.getByLabel("Institución operadora").selectOption("demo-operator-id");
  await page.getByLabel("Unidad asignada").selectOption("demo-ambulance-id");
  await page.getByRole("button", { name: "Crear y enviar activación" }).click();
  await page.getByRole("status").filter({ hasText: "Se envió un enlace de activación" }).waitFor({ state: "visible" });
  await page.getByRole("button", { name: "Historial de cuentas" }).click();
  await page.getByText("synthetic_operator_02").first().waitFor({ state: "visible" });

  const created = api.managedAccounts.at(-1);
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
  await operatorPage.getByText("Unidad", { exact: true }).first().waitFor({ state: "visible" });
  await operatorPage.getByText("SYN-01", { exact: true }).waitFor({ state: "visible" });
  if (await operatorPage.getByRole("heading", { name: "Episodios de la unidad" }).count()) {
    throw new Error("La lista de episodios ocupa la vista del formulario");
  }
  await operatorPage.getByRole("button", { name: "Episodios de la unidad" }).click();
  await operatorPage.getByRole("heading", { name: "Episodios de la unidad" }).waitFor({ state: "visible" });
  if (await operatorPage.getByRole("heading", { name: "Nueva emergencia" }).count()) {
    throw new Error("El formulario sigue visible en la vista de episodios");
  }
  if (await operatorPage.getByRole("button", { name: "Administración" }).count()) {
    await operatorPage.getByRole("button", { name: "Administración" }).click();
    await operatorPage.getByRole("status").filter({ hasText: "reservada al perfil administrativo de Urgencias" }).waitFor({ state: "visible" });
  } else {
    if (await operatorPage.getByRole("button", { name: "Crear y enviar activación" }).count()) {
      throw new Error("El perfil demo de ambulancias muestra la creación de cuentas");
    }
  }
  if (await operatorPage.getByRole("button", { name: "Crear y enviar activación" }).count()) {
    throw new Error("El perfil demo de ambulancias muestra la creación de cuentas");
  }
  await operatorContext.close();

  const urgenciasContext = await browser.newContext();
  await mockAuthenticatedApi(urgenciasContext, { groups: ["urgencias", "view_reports"], includeUrgenciasQueue: true });
  const urgenciasPage = await urgenciasContext.newPage();
  await urgenciasPage.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await urgenciasPage.getByLabel("Usuario").fill("synthetic_urgencias");
  await urgenciasPage.getByLabel("Contraseña").fill("local-test-password");
  await urgenciasPage.getByRole("button", { name: "Iniciar sesión" }).click();
  await urgenciasPage.getByRole("heading", { name: "Episodios entrantes" }).waitFor({ state: "visible" });
  await urgenciasPage.getByRole("button", { name: /Caso en traslado/ }).waitFor({ state: "visible" });
  const incomingCards = urgenciasPage.locator("section.mt-5 button.w-full.rounded-xl");
  if (await incomingCards.count() !== 23) throw new Error("H: la bandeja debe conservar todos los llegados pendientes, sin límite visual de 20");
  const firstIncoming = await incomingCards.first().innerText();
  const lastIncoming = await incomingCards.last().innerText();
  if (!firstIncoming.includes("Llegado sintético 01") || !lastIncoming.includes("Caso en traslado")) {
    throw new Error("D-007: episodios de la misma categoría deben mostrar el más antiguo primero");
  }
  const firstCard = incomingCards.first();
  if (await firstCard.getByText("FC", { exact: true }).count() !== 1
    || await firstCard.getByText("124", { exact: true }).count() !== 1
    || await firstCard.getByText("SatO₂", { exact: true }).count() !== 1) {
    throw new Error("La tarjeta de Urgencias no muestra los signos vitales en la vista principal");
  }
  await urgenciasPage.getByRole("button", { name: "Histórico e informes" }).click();
  await urgenciasPage.getByRole("heading", { name: "Histórico e informes del destino" }).waitFor({ state: "visible" });
  const archiveCards = urgenciasPage.locator('button[aria-label^="Ver episodio"]');
  await urgenciasPage.getByText("24 episodios", { exact: true }).waitFor();
  if (await archiveCards.count() !== 24) throw new Error("H: el histórico autorizado no muestra la página esperada");
  await urgenciasPage.getByLabel("Estado del informe").selectOption("cancelada");
  await urgenciasPage.getByLabel("Desde (fecha de creación)").fill("2025-02-10");
  await urgenciasPage.getByLabel("Hasta (fecha de creación)").fill("2025-02-10");
  await urgenciasPage.getByRole("button", { name: "Aplicar filtros", exact: true }).click();
  await urgenciasPage.getByText("1 episodio", { exact: true }).waitFor();
  if (await archiveCards.count() !== 1 || !(await archiveCards.first().innerText()).includes("Cancelado sintético")) {
    throw new Error("Los filtros de fecha/estado del archivo no coinciden");
  }
  await urgenciasPage.getByRole("button", { name: "Urgencias", exact: true }).click();
  await urgenciasPage.getByRole("button", { name: /Caso en traslado/ }).click();
  await urgenciasPage.getByRole("button", { name: "Marcar como llegado a Urgencias" }).click();
  await urgenciasPage.getByText(/Llegada registrada:/).waitFor({ state: "visible" });
  await urgenciasPage.getByRole("button", { name: "Cerrar episodio" }).waitFor({ state: "visible" });

  await urgenciasContext.close();

  console.log("✓ Admin de Urgencias crea cuentas; ambulancias no y Urgencias confirma llegada");
  await context.close();
} finally {
  await browser.close();
}
