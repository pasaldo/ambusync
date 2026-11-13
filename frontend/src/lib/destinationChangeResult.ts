import type { BackendEmergency } from "./backend";
import { hasMilestoneProof } from "./milestoneProof.ts";

export interface DestinationChangeResult { original: BackendEmergency; replacement: BackendEmergency }

function isEpisode(value: unknown): value is BackendEmergency {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<BackendEmergency>;
  return typeof item.id === "string" && Boolean(item.id)
    && Number.isInteger(item.version) && item.version! >= 1
    && ["notificada", "en_traslado", "llegado", "cancelada", "cerrada"].includes(item.status ?? "")
    && Boolean(item.patient && typeof item.patient.identity_unknown === "boolean")
    && typeof item.reason === "string" && typeof item.created_at === "string"
    && typeof item.destination_name === "string" && typeof item.ambulance_code === "string"
    && Array.isArray(item.symptoms) && Array.isArray(item.vital_measurements);
}

/** A cancelled source alone never proves the atomic replacement was confirmed. */
export function isDestinationChangeResult(value: unknown, originalId: string, sent: { expected_version: number; destination_id: string; reason: string }): value is DestinationChangeResult {
  if (!value || typeof value !== "object") return false;
  const { original, replacement } = value as Partial<DestinationChangeResult>;
  return isEpisode(original) && isEpisode(replacement)
    && original.id === originalId && replacement.id !== original.id
    && original.status === "cancelada" && original.version > sent.expected_version
    && hasMilestoneProof(original.cancelled_at, original.cancelled_by_id)
    && original.cancellation_reason === sent.reason
    && original.replaced_by_id === replacement.id && replacement.replaces_id === original.id
    && (["identity_unknown", "alias", "age_value", "age_unit", "recorded_sex"] as const).every((field) => original.patient[field] === replacement.patient[field])
    && replacement.destination_id === sent.destination_id && original.destination_id !== sent.destination_id
    && typeof original.ambulance_id === "string" && Boolean(original.ambulance_id) && original.ambulance_id === replacement.ambulance_id
    && typeof original.operating_institution_id === "string" && Boolean(original.operating_institution_id) && original.operating_institution_id === replacement.operating_institution_id;
}
