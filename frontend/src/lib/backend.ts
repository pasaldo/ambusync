import { prepareOperation, type PendingOperation } from "./pendingOperation";

export interface BackendSession {
  started_at: number;
  idle_expires_at: number;
  absolute_expires_at: number;
}

export interface BackendUser {
  id: string;
  username: string;
  groups: string[];
  institutions: { id: string; name: string }[];
  ambulance: { id: string; code: string; institution_name: string } | null;
  session: BackendSession;
}

export interface Destination {
  id: string;
  name: string;
}

export interface ManagedAmbulance {
  id: string;
  code: string;
  institution_id: string;
  institution_name: string;
}

export interface ManagedInstitution {
  id: string;
  name: string;
}

export interface ManagedAccount {
  id: string;
  username: string;
  email: string;
  institution_name: string;
  groups: string[];
  active: boolean;
  ambulance: ManagedAmbulance | null;
}

export interface AccountManagementConfig {
  institution_name: string;
  delegable_groups: string[];
  operator_institutions: ManagedInstitution[];
  can_create_accounts: boolean;
}

export interface VitalMeasurement {
  kind: string;
  value: number;
  unit: string;
  measured_at: string;
  recorded_at: string;
}

export interface BackendEmergency {
  id: string;
  destination_id: string;
  destination_name: string;
  ambulance_code: string;
  status: "notificada" | "en_traslado" | "llegado" | "cancelada" | "cerrada";
  patient: {
    identity_unknown: boolean;
    alias: string | null;
    age_value: number | null;
    age_unit: "years" | "months" | "days" | null;
    recorded_sex: "F" | "M" | "X" | null;
  };
  reason: string;
  symptoms: string[];
  notes: string;
  triage: "C1" | "C2" | "C3" | "C4" | "C5" | null;
  vital_measurements: VitalMeasurement[];
  created_at: string;
  transfer_declared_at: string | null;
  transfer_declared_by_id: string | null;
  arrived_at: string | null;
  arrived_by_id: string | null;
  arrival_reason: string;
  cancelled_at: string | null;
  cancelled_by_id: string | null;
  cancellation_reason: string;
  closed_at: string | null;
  closed_by_id: string | null;
  version: number;
}

interface ApiErrorBody {
  code?: string;
  message?: string;
  fields?: Record<string, unknown>;
}

export class BackendApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly fields?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "BackendApiError";
  }
}

let csrfToken: string | null = null;
let csrfGeneration = 0;

async function request<T>(
  path: string,
  options: RequestInit & { humanInteraction?: boolean } = {},
): Promise<T> {
  const { humanInteraction = false, headers, ...init } = options;
  const response = await fetch(path, {
    ...init,
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(humanInteraction ? { "X-AmbuSync-User-Interaction": "1" } : {}),
      ...(headers ?? {}),
    },
  });

  if (response.status === 204) return undefined as T;
  const body = await response.json().catch(() => {
    throw new Error("La respuesta del servidor no se pudo interpretar.");
  });
  if (!response.ok) {
    const error = body as ApiErrorBody;
    if (!error || typeof error.code !== "string" || typeof error.message !== "string") {
      throw new Error("No se pudo confirmar el resultado de la solicitud.");
    }
    throw new BackendApiError(
      error.message ?? "No se pudo completar la solicitud al backend local.",
      response.status,
      error.code,
      error.fields,
    );
  }
  return body as T;
}

async function ensureCsrf(): Promise<string> {
  if (!csrfToken) {
    const generation = csrfGeneration;
    const result = await request<{ csrf_token: string }>("/api/v1/auth/csrf/");
    if (generation !== csrfGeneration) throw new Error("La sesión cambió durante la solicitud.");
    csrfToken = result.csrf_token;
  }
  return csrfToken;
}

export async function login(username: string, password: string): Promise<void> {
  csrfGeneration += 1;
  csrfToken = null;
  const token = await ensureCsrf();
  await request("/api/v1/auth/login/", {
    method: "POST",
    headers: { "X-CSRFToken": token },
    body: JSON.stringify({ username, password }),
  });
  // Django rotates the CSRF secret at login; obtain its new masked token.
  csrfGeneration += 1;
  csrfToken = null;
  await ensureCsrf();
}

export async function getCurrentUser(humanInteraction = false): Promise<BackendUser> {
  return request("/api/v1/auth/me/", { humanInteraction });
}

export async function logout(): Promise<void> {
  const generation = ++csrfGeneration;
  const token = await ensureCsrf();
  await request("/api/v1/auth/logout/", {
    method: "POST",
    headers: { "X-CSRFToken": token },
    body: "{}",
    humanInteraction: true,
  });
  if (generation === csrfGeneration) csrfToken = null;
}

export async function listManagedAccounts(): Promise<ManagedAccount[]> {
  return request("/api/v1/institutions/management/accounts/");
}

export async function listManagedAmbulances(): Promise<ManagedAmbulance[]> {
  return request("/api/v1/institutions/management/ambulances/");
}

export interface SystemInstitution {
  id: string;
  name: string;
  kind: "operator" | "receiver" | "combined";
  enabled: boolean;
  rut: string;
  address: string;
  phone: string;
  email: string;
}

export interface NewSystemInstitution {
  name: string;
  rut: string;
  address: string;
  phone: string;
  email: string;
  first_username: string;
  first_email: string;
}

export async function createManagedAmbulance(code: string, institutionId: string): Promise<ManagedAmbulance> {
  const token = await ensureCsrf();
  return request("/api/v1/institutions/management/ambulances/create/", { method: "POST", headers: { "X-CSRFToken": token }, body: JSON.stringify({ code, institution_id: institutionId }), humanInteraction: true });
}

export async function assignManagedAccount(userId: string, ambulanceId: string): Promise<{ id: string; code: string }> {
  const token = await ensureCsrf();
  return request(`/api/v1/institutions/management/accounts/${encodeURIComponent(userId)}/assignment/`, { method: "POST", headers: { "X-CSRFToken": token }, body: JSON.stringify({ ambulance_id: ambulanceId }), humanInteraction: true });
}

export async function getAccountManagementConfig(): Promise<AccountManagementConfig> {
  return request("/api/v1/institutions/management/config/");
}

export async function listSystemInstitutions(status: "all" | "active" | "inactive" = "all", query = ""): Promise<SystemInstitution[]> {
  const search = new URLSearchParams({ status, ...(query ? { q: query } : {}) });
  return request(`/api/v1/system/institutions/?${search.toString()}`);
}

export async function createSystemInstitution(payload: NewSystemInstitution): Promise<SystemInstitution & {
  first_account: { id: string; username: string };
  activation_sent: boolean;
}> {
  const token = await ensureCsrf();
  return request("/api/v1/system/institutions/", {
    method: "POST",
    headers: { "X-CSRFToken": token },
    body: JSON.stringify(payload),
    humanInteraction: true,
  });
}

export async function updateSystemInstitution(id: string, payload: Omit<NewSystemInstitution, "first_username" | "first_email">): Promise<SystemInstitution> {
  const token = await ensureCsrf();
  return request(`/api/v1/system/institutions/${encodeURIComponent(id)}/`, {
    method: "PATCH",
    headers: { "X-CSRFToken": token },
    body: JSON.stringify(payload),
    humanInteraction: true,
  });
}

export async function setSystemInstitutionEnabled(id: string, enabled: boolean): Promise<SystemInstitution> {
  const token = await ensureCsrf();
  return request(`/api/v1/system/institutions/${encodeURIComponent(id)}/${enabled ? "reactivate" : "deactivate"}/`, {
    method: "POST",
    headers: { "X-CSRFToken": token },
    body: "{}",
    humanInteraction: true,
  });
}

export async function createManagedAccount(payload: {
  username: string;
  email: string;
  groups: string[];
  ambulance_id?: string;
  institution_id?: string;
}): Promise<{ id: string; username: string; activation_sent: boolean }> {
  const token = await ensureCsrf();
  return request("/api/v1/institutions/management/accounts/", {
    method: "POST",
    headers: { "X-CSRFToken": token },
    body: JSON.stringify(payload),
    humanInteraction: true,
  });
}

export async function deactivateManagedAccount(userId: string): Promise<void> {
  const token = await ensureCsrf();
  await request(`/api/v1/institutions/management/accounts/${encodeURIComponent(userId)}/deactivate/`, {
    method: "POST",
    headers: { "X-CSRFToken": token },
    body: "{}",
    humanInteraction: true,
  });
}

export async function resendManagedActivation(userId: string): Promise<void> {
  const token = await ensureCsrf();
  await request(`/api/v1/institutions/management/accounts/${encodeURIComponent(userId)}/resend-activation/`, {
    method: "POST",
    headers: { "X-CSRFToken": token },
    body: "{}",
    humanInteraction: true,
  });
}

export async function activateAccount(payload: {
  uid: string;
  token: string;
  password: string;
  password_confirmation: string;
}): Promise<void> {
  await request("/api/v1/auth/activate/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function listDestinations(): Promise<Destination[]> {
  return request("/api/v1/institutions/destinations/");
}

export async function listEmergencies(): Promise<BackendEmergency[]> {
  const results: BackendEmergency[] = [];
  let pageNumber = 1;
  let hasNextPage = true;
  while (hasNextPage) {
    const page = await request<{ results: BackendEmergency[]; next: string | null }>(
      `/api/v1/emergencies/?page_size=100&page=${pageNumber}`,
    );
    results.push(...page.results);
    hasNextPage = page.next !== null;
    pageNumber += 1;
  }
  return results;
}

export function isUncertainWrite(error: unknown): boolean {
  return !(error instanceof BackendApiError) || error.status >= 500 || error.status === 408;
}

export async function sendEmergencyOperation(operation: PendingOperation, isCurrent: () => boolean): Promise<BackendEmergency> {
  if (!isCurrent()) throw new Error("La operación ya no pertenece a la sesión actual.");
  const token = await ensureCsrf();
  // Awaiting CSRF must never let an old payload run under a replacement cookie.
  if (!isCurrent()) throw new Error("La operación ya no pertenece a la sesión actual.");
  const result = await request<BackendEmergency>(operation.path, {
    method: "POST",
    headers: { "X-CSRFToken": token },
    body: operation.body,
    humanInteraction: true,
  });
  if (!result || typeof result.id !== "string" || !result.id
    || !Number.isInteger(result.version) || result.version < 1
    || !["notificada", "en_traslado", "llegado", "cancelada", "cerrada"].includes(result.status)
    || !result.patient || typeof result.patient.identity_unknown !== "boolean"
    || typeof result.reason !== "string" || typeof result.destination_name !== "string"
    || typeof result.ambulance_code !== "string" || typeof result.created_at !== "string"
    || !Array.isArray(result.symptoms) || !Array.isArray(result.vital_measurements)) {
    throw new Error("No se pudo confirmar la respuesta de la operación.");
  }
  const transition = operation.path.match(/^\/api\/v1\/emergencies\/([^/]+)\/(arrival|transfer-start|cancel|close)\/$/);
  if (transition) {
    const sent = JSON.parse(operation.body) as { expected_version: number };
    if (result.id !== decodeURIComponent(transition[1]) || result.version <= sent.expected_version
      || (transition[2] === "close" && result.status !== "cerrada")
      || (transition[2] === "cancel" && result.status !== "cancelada")
      || (transition[2] === "arrival" && !["llegado", "cerrada"].includes(result.status))) {
      throw new Error("La respuesta no confirma la operación de este episodio.");
    }
  }
  return result;
}

export type EmergencyAction = "arrival" | "transfer-start" | "cancel" | "close";

export function prepareEmergencyTransition(
  emergency: BackendEmergency,
  action: EmergencyAction,
  extra: Record<string, string> = {},
): PendingOperation {
  return prepareOperation(`/api/v1/emergencies/${encodeURIComponent(emergency.id)}/${action}/`, {
    ...extra, expected_version: emergency.version,
  });
}
