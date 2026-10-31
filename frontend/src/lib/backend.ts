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
  session: BackendSession;
}

export interface Destination {
  id: string;
  name: string;
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
  status: "notificada" | "en_traslado";
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
  const body = await response.json().catch(() => ({} as ApiErrorBody));
  if (!response.ok) {
    const error = body as ApiErrorBody;
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
    const result = await request<{ csrf_token: string }>("/api/v1/auth/csrf/");
    csrfToken = result.csrf_token;
  }
  return csrfToken;
}

export async function login(username: string, password: string): Promise<void> {
  const token = await ensureCsrf();
  await request("/api/v1/auth/login/", {
    method: "POST",
    headers: { "X-CSRFToken": token },
    body: JSON.stringify({ username, password }),
  });
  // Django rotates the CSRF secret at login; obtain its new masked token.
  csrfToken = null;
  await ensureCsrf();
}

export async function getCurrentUser(humanInteraction = false): Promise<BackendUser> {
  return request("/api/v1/auth/me/", { humanInteraction });
}

export async function logout(): Promise<void> {
  const token = await ensureCsrf();
  await request("/api/v1/auth/logout/", {
    method: "POST",
    headers: { "X-CSRFToken": token },
    body: "{}",
    humanInteraction: true,
  });
  csrfToken = null;
}

export async function listDestinations(): Promise<Destination[]> {
  return request("/api/v1/institutions/destinations/");
}

export async function listEmergencies(): Promise<BackendEmergency[]> {
  const page = await request<{ results: BackendEmergency[] }>("/api/v1/emergencies/?page_size=100");
  return page.results;
}

export async function createEmergency(payload: Record<string, unknown>): Promise<BackendEmergency> {
  const token = await ensureCsrf();
  return request("/api/v1/emergencies/", {
    method: "POST",
    headers: { "X-CSRFToken": token },
    body: JSON.stringify(payload),
    humanInteraction: true,
  });
}
