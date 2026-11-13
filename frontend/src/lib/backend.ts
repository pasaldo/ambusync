import { prepareOperation, type PendingOperation } from "./pendingOperation";
import { hasMilestoneProof } from "./milestoneProof";
import { hasPatientContextOperation, type PatientContextCorrection } from "./patientContextProof";
import { isDestinationChangeResult, type DestinationChangeResult } from "./destinationChangeResult";
import { isResourceResult, type ResourceAttempt, type ResourceResult, type PatientRecord, type CatalogSymptom } from "./resourceOperation";

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
  enabled: boolean;
  can_deactivate: boolean;
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
  institution_id: string;
  groups: string[];
  active: boolean;
  ambulance: Pick<ManagedAmbulance, "id" | "code"> | null;
}

export interface AccountManagementConfig {
  institution_name: string;
  delegable_groups: string[];
  operator_institutions: ManagedInstitution[];
  can_create_accounts: boolean;
}

export interface VitalMeasurement {
  id?: string;
  kind: string;
  value: number;
  unit: string;
  measured_at: string;
  recorded_at: string;
  recorded_by_id?: string;
  operation_id?: string | null;
  rectifies_id?: string | null;
  rectified_by_id?: string | null;
  is_current?: boolean;
  rectification_reason?: string;
  inherited_at?: string | null;
}

export interface BackendEmergency {
  patient_context_corrections?: PatientContextCorrection[];
  id: string;
  patient_id?: string | null;
  patient_record_version?: number | null;
  patient_record_enabled?: boolean | null;
  ambulance_id?: string;
  operating_institution_id?: string;
  replaces_id?: string | null;
  replaced_by_id?: string | null;
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
  triage_recorded_at?: string | null;
  triage_recorded_by_id?: string | null;
  vital_measurements: VitalMeasurement[];
  created_at: string;
  read_at?: string | null;
  read_by_id?: string | null;
  prepared_at?: string | null;
  prepared_by_id?: string | null;
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
  return request("/api/v1/institutions/management/ambulances/?include_disabled=true");
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

async function managementMutation<T>(path: string, body: unknown, isCurrent: () => boolean): Promise<T> {
  const generation = csrfGeneration;
  const token = await ensureCsrf();
  if (generation !== csrfGeneration || !isCurrent()) throw new Error("La sesión cambió durante la solicitud.");
  return request(path, { method: "POST", headers: { "X-CSRFToken": token }, body: JSON.stringify(body), humanInteraction: true });
}

export async function createManagedAmbulance(code: string, institutionId: string, isCurrent = () => true): Promise<ManagedAmbulance> {
  return managementMutation("/api/v1/institutions/management/ambulances/create/", { code, institution_id: institutionId }, isCurrent);
}

export async function assignManagedAccount(userId: string, ambulanceId: string | null, expectedAmbulanceId: string | null, isCurrent = () => true): Promise<{ id: string; code: string } | void> {
  return managementMutation(`/api/v1/institutions/management/accounts/${encodeURIComponent(userId)}/assignment/`, { ambulance_id: ambulanceId, expected_ambulance_id: expectedAmbulanceId }, isCurrent);
}

export async function deactivateManagedAmbulance(id: string, isCurrent = () => true): Promise<void> {
  return managementMutation(`/api/v1/institutions/management/ambulances/${encodeURIComponent(id)}/deactivate/`, {}, isCurrent);
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
}, isCurrent = () => true): Promise<{ id: string; username: string; activation_sent: boolean }> {
  return managementMutation("/api/v1/institutions/management/accounts/", payload, isCurrent);
}

export async function deactivateManagedAccount(userId: string, isCurrent = () => true): Promise<void> {
  return managementMutation(`/api/v1/institutions/management/accounts/${encodeURIComponent(userId)}/deactivate/`, {}, isCurrent);
}

export async function resendManagedActivation(userId: string, isCurrent = () => true): Promise<void> {
  return managementMutation(`/api/v1/institutions/management/accounts/${encodeURIComponent(userId)}/resend-activation/`, {}, isCurrent);
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

async function listResourcePages<T>(path: string): Promise<T[]> {
  const rows: T[] = [];
  for (let page = 1; ; page += 1) {
    const result = await request<{ results: T[]; next: string | null }>(`${path}?page_size=100&page=${page}`);
    rows.push(...result.results);
    if (!result.next) return rows;
  }
}

export const listUnitPatients = () => listResourcePages<PatientRecord>("/api/v1/patients/");
export const listInstitutionSymptoms = () => listResourcePages<CatalogSymptom>("/api/v1/institutions/symptoms/");

export interface ReadPage<T> { count: number; next: string | null; previous: string | null; results: T[] }
export interface ReportPage extends ReadPage<BackendEmergency> {
  summary: { total: number; by_status: Record<string, number>; by_triage: Record<string, number> };
  ambulances: { id: string; code: string }[]; timezone: string; date_basis: string;
}
export interface AdministrativeAuditRow { id: string; actor_id: string | null; occurred_at: string; action: string; object_type: string; object_id: string; result: string; correlation_id: string; display: { actor: string; account: string | null; unit: string | null; reference_basis: "current_records" } }
export interface HistoryPage extends ReadPage<BackendEmergency & { event_date: string }> { timezone: string; date_basis: string; ambulances: { id: string; code: string }[] }
export async function getHistoryPage(path: string): Promise<HistoryPage> {
  const data = await request<HistoryPage>(path, { cache: "no-store", humanInteraction: true });
  if (!data || !Array.isArray(data.results) || !Number.isInteger(data.count) || !Array.isArray(data.ambulances) || data.date_basis !== "event_date" || data.timezone !== "America/Santiago") throw new Error("No se pudo validar el archivo recibido.");
  return data;
}
export async function getReportPage(path: string): Promise<ReportPage> {
  const data = await request<ReportPage>(path, { cache: "no-store", humanInteraction: true });
  if (!data || !Array.isArray(data.results) || !Number.isInteger(data.count) || !data.summary || data.summary.total !== data.count || !data.summary.by_status || !data.summary.by_triage || !Array.isArray(data.ambulances)) throw new Error("No se pudo validar el informe recibido.");
  return data;
}
export async function getReportDetail(path: string): Promise<BackendEmergency> {
  const data = await request<BackendEmergency>(path, { cache: "no-store", humanInteraction: true });
  const match = path.match(/^\/api\/v1\/(?:reports\/)?emergencies\/([^/]+)\/$/);
  if (!match || !data || data.id !== decodeURIComponent(match[1]) || !data.patient || !Array.isArray(data.vital_measurements) || !Array.isArray(data.symptoms) || typeof data.reason !== "string") throw new Error("El detalle recibido no corresponde al episodio solicitado.");
  return data;
}
export async function getAdministrativeAudit(path: string): Promise<ReadPage<AdministrativeAuditRow>> {
  const data = await request<ReadPage<AdministrativeAuditRow>>(path, { cache: "no-store", humanInteraction: true });
  if (!data || !Array.isArray(data.results) || !Number.isInteger(data.count) || data.results.some((row) => !row.display || typeof row.display.actor !== "string" || row.display.reference_basis !== "current_records" || (row.display.account !== null && typeof row.display.account !== "string") || (row.display.unit !== null && typeof row.display.unit !== "string"))) throw new Error("No se pudo validar la auditoría recibida.");
  return data;
}

export async function sendResourceOperation(attempt: ResourceAttempt, isCurrent: () => boolean): Promise<ResourceResult> {
  const result = await requestEmergencyOperation<unknown>(attempt.operation, isCurrent);
  if (!isResourceResult(result, attempt)) throw new Error("La respuesta no confirma el registro solicitado.");
  return result;
}

async function requestEmergencyOperation<T>(operation: PendingOperation, isCurrent: () => boolean): Promise<T> {
  if (!isCurrent()) throw new Error("La operación ya no pertenece a la sesión actual.");
  const token = await ensureCsrf();
  // Awaiting CSRF must never let an old payload run under a replacement cookie.
  if (!isCurrent()) throw new Error("La operación ya no pertenece a la sesión actual.");
  return request<T>(operation.path, {
    method: "POST",
    headers: { "X-CSRFToken": token },
    body: operation.body,
    humanInteraction: true,
  });
}

export async function sendDestinationChangeOperation(operation: PendingOperation, isCurrent: () => boolean): Promise<DestinationChangeResult> {
  const match = operation.path.match(/^\/api\/v1\/emergencies\/([^/]+)\/change-destination\/$/);
  if (!match) throw new Error("La operación no es un cambio de destino.");
  const result = await requestEmergencyOperation<unknown>(operation, isCurrent);
  if (!isDestinationChangeResult(result, decodeURIComponent(match[1]), JSON.parse(operation.body))) {
    throw new Error("La respuesta no confirma la cancelación y su reemplazo vinculado.");
  }
  return result;
}

export async function sendEmergencyOperation(operation: PendingOperation, isCurrent: () => boolean): Promise<BackendEmergency> {
  const result = await requestEmergencyOperation<BackendEmergency>(operation, isCurrent);
  if (!result || typeof result.id !== "string" || !result.id
    || !Number.isInteger(result.version) || result.version < 1
    || !["notificada", "en_traslado", "llegado", "cancelada", "cerrada"].includes(result.status)
    || !result.patient || typeof result.patient.identity_unknown !== "boolean"
    || typeof result.reason !== "string" || typeof result.destination_name !== "string"
    || typeof result.ambulance_code !== "string" || typeof result.created_at !== "string"
    || !Array.isArray(result.symptoms) || !Array.isArray(result.vital_measurements)) {
    throw new Error("No se pudo confirmar la respuesta de la operación.");
  }
  const transition = operation.path.match(/^\/api\/v1\/emergencies\/([^/]+)\/(arrival|transfer-start|cancel|close|update|measurements(?:\/rectify)?|read|prepare|patient-context)\/$/);
  if (transition) {
    const sent = JSON.parse(operation.body) as { expected_version: number };
    const milestone = transition[2] === "read" || transition[2] === "prepare";
    if (result.id !== decodeURIComponent(transition[1]) || (milestone ? result.version < sent.expected_version : result.version <= sent.expected_version)
      || (milestone && !hasMilestoneProof(result.read_at, result.read_by_id))
      || (transition[2] === "prepare" && !hasMilestoneProof(result.prepared_at, result.prepared_by_id))
      || (transition[2] === "close" && result.status !== "cerrada")
      || (transition[2] === "cancel" && result.status !== "cancelada")
      || (transition[2] === "arrival" && !["llegado", "cerrada"].includes(result.status))) {
      throw new Error("La respuesta no confirma la operación de este episodio.");
    }
    if (transition[2] === "patient-context" && !hasPatientContextOperation(result, JSON.parse(operation.body))) throw new Error("La respuesta no acredita la corrección de identificación enviada.");
  }
  return result;
}

export type EmergencyAction = "arrival" | "transfer-start" | "cancel" | "close" | "update" | "measurements" | "measurements/rectify" | "read" | "prepare" | "change-destination" | "patient-context";

export function prepareEmergencyTransition(
  emergency: BackendEmergency,
  action: EmergencyAction,
  extra: Record<string, unknown> = {},
): PendingOperation {
  return prepareOperation(`/api/v1/emergencies/${encodeURIComponent(emergency.id)}/${action}/`, {
    ...extra, expected_version: emergency.version,
  });
}
