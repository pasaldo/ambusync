import type { BackendEmergency } from "./backend";
import type { PendingOperation } from "./pendingOperation";

export interface PatientRecord { id: string; enabled: boolean; version: number; patient: BackendEmergency["patient"] }
export interface CatalogSymptom { id: string; institution_id: string; description: string; enabled: boolean; version: number }
export type ResourceKind = "patient-update" | "patient-deactivate" | "symptom-create" | "symptom-deactivate";
export interface ResourceAttempt { kind: ResourceKind; targetId: string; institutionId?: string; operation: PendingOperation }
export type ResourceResult = { id: string; enabled: boolean; version: number; patient?: BackendEmergency["patient"]; description?: string; institution_id?: string };

export function isResourceResult(value: unknown, attempt: ResourceAttempt): value is ResourceResult {
  if (!value || typeof value !== "object") return false;
  const result = value as ResourceResult;
  const sent = JSON.parse(attempt.operation.body) as { expected_version: number; description?: string };
  if (typeof result.id !== "string" || !result.id || typeof result.enabled !== "boolean" || !Number.isInteger(result.version) || result.version < 1) return false;
  if (attempt.kind !== "symptom-create" && result.id !== attempt.targetId) return false;
  if (attempt.kind === "patient-update") {
    const p = result.patient;
    return result.version > sent.expected_version && Boolean(p && typeof p.identity_unknown === "boolean" && (p.alias === null || typeof p.alias === "string") && (p.age_value === null || Number.isInteger(p.age_value)) && [null, "years", "months", "days"].includes(p.age_unit) && [null, "F", "M", "X"].includes(p.recorded_sex));
  }
  if (attempt.kind === "patient-deactivate") return !result.enabled && result.version >= sent.expected_version;
  return typeof result.description === "string" && result.description.trim().length > 0
    && result.institution_id === attempt.institutionId
    && (attempt.kind === "symptom-deactivate" ? !result.enabled && result.version >= sent.expected_version : result.description === sent.description?.trim().replace(/\s+/g, " "));
}
