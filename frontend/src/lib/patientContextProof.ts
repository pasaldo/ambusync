import type { BackendEmergency } from "./backend";

type Patient = BackendEmergency["patient"];
export interface PatientContextCorrection {
  id: string; previous_patient: Patient; corrected_patient: Patient; reason: string;
  recorded_by_id: string; recorded_at: string; operation_id: string; episode_version: number;
}
const fields = ["identity_unknown", "alias", "age_value", "age_unit", "recorded_sex"] as const;
export function isPatient(value: unknown): value is Patient {
  if (!value || typeof value !== "object") return false;
  const p = value as Patient;
  return typeof p.identity_unknown === "boolean" && (p.alias === null || typeof p.alias === "string")
    && (p.age_value === null || (Number.isInteger(p.age_value) && p.age_value >= 0 && p.age_value <= 130))
    && [null, "years", "months", "days"].includes(p.age_unit) && [null, "F", "M", "X"].includes(p.recorded_sex)
    && ((p.age_value === null) === (p.age_unit === null))
    && !(p.age_unit === "months" && p.age_value! > 11) && !(p.age_unit === "days" && p.age_value! > 30)
    && !(p.identity_unknown && p.alias !== null);
}
export function samePatient(a: Patient, b: Patient): boolean { return fields.every((key) => a[key] === b[key]); }

export function hasPatientContextLineage(episode: BackendEmergency, initial?: Patient): boolean {
  if (!isPatient(episode.patient)) return false;
  const history = episode.patient_context_corrections;
  if (history === undefined) return !initial || samePatient(initial, episode.patient);
  if (!Array.isArray(history)) return false;
  let previous = initial;
  let version = 1;
  const ids = new Set<string>(), operations = new Set<string>();
  for (const item of history) {
    if (!item || typeof item.id !== "string" || !item.id || ids.has(item.id)
      || typeof item.recorded_by_id !== "string" || !item.recorded_by_id || !Number.isFinite(Date.parse(item.recorded_at))
      || typeof item.reason !== "string" || item.reason.trim().length < 3
      || typeof item.operation_id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(item.operation_id)
      || operations.has(`${item.recorded_by_id}:${item.operation_id}`)
      || !Number.isInteger(item.episode_version) || item.episode_version <= version || item.episode_version > episode.version
      || !isPatient(item.previous_patient) || !isPatient(item.corrected_patient)
      || (previous && !samePatient(previous, item.previous_patient))) return false;
    ids.add(item.id); operations.add(`${item.recorded_by_id}:${item.operation_id}`);
    previous = item.corrected_patient; version = item.episode_version;
  }
  return !previous || samePatient(previous, episode.patient);
}

export function hasPatientContextOperation(episode: BackendEmergency, sent: Record<string, unknown>): boolean {
  if (!hasPatientContextLineage(episode)) return false;
  const row = episode.patient_context_corrections?.find((item) => item.operation_id === sent.operation_id && item.episode_version === Number(sent.expected_version) + 1);
  const requested: Patient = { identity_unknown: Boolean(sent.patient_identity_unknown), alias: sent.patient_identity_unknown ? null : String(sent.patient_alias ?? "").trim() || null,
    age_value: (sent.age_value ?? null) as number | null, age_unit: (sent.age_unit || null) as Patient["age_unit"], recorded_sex: (sent.recorded_sex ?? null) as Patient["recorded_sex"] };
  return Boolean(row && row.reason === String(sent.reason ?? "").trim() && samePatient(row.corrected_patient, requested));
}
