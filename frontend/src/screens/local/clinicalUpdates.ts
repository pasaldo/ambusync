import type { BackendEmergency, VitalMeasurement } from "../../lib/backend";

export const MEASUREMENT_OPTIONS = [
  { key: "hr", kind: "heart_rate", label: "Frecuencia cardíaca", unit: "lpm", step: "1", min: "0" },
  { key: "bp_sys", kind: "systolic_pressure", label: "Presión sistólica", unit: "mmHg", step: "1", min: "0" },
  { key: "bp_dia", kind: "diastolic_pressure", label: "Presión diastólica", unit: "mmHg", step: "1", min: "0" },
  { key: "spo2", kind: "spo2", label: "SpO₂", unit: "%", step: "0.01", min: "0", max: "100" },
  { key: "rr", kind: "respiratory_rate", label: "Frecuencia respiratoria", unit: "rpm", step: "1", min: "0" },
  { key: "temp_c", kind: "temperature", label: "Temperatura", unit: "°C", step: "0.1" },
  { key: "glasgow", kind: "glasgow", label: "Glasgow", unit: "puntos", step: "1", min: "3", max: "15" },
] as const;

export interface ClinicalDraft {
  version: number;
  reason: string;
  notes: string;
  symptoms: string[];
  triage: BackendEmergency["triage"];
  measurementKey: string;
  value: string;
  measuredAt: string;
  rectifiesId: string;
  rectificationReason: string;
}

export function localMeasurementTime(value = new Date().toISOString()): string {
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 23);
}

export function clinicalDraft(emergency: BackendEmergency): ClinicalDraft {
  return { version: emergency.version, reason: emergency.reason, notes: emergency.notes ?? "", symptoms: [...emergency.symptoms], triage: emergency.triage, measurementKey: "hr", value: "", measuredAt: localMeasurementTime(), rectifiesId: "", rectificationReason: "" };
}

export function currentMeasurements(measurements: VitalMeasurement[]): VitalMeasurement[] {
  return measurements.filter((item) => item.is_current !== false && !item.rectified_by_id).sort((a, b) =>
    Date.parse(a.measured_at) - Date.parse(b.measured_at)
    || Date.parse(a.recorded_at ?? a.measured_at) - Date.parse(b.recorded_at ?? b.measured_at)
    || (a.id ?? "").localeCompare(b.id ?? "", undefined, { numeric: true }));
}

export function reconcileClinicalDraft(draft: ClinicalDraft, updated: BackendEmergency, action: string, expectedVersion: number): ClinicalDraft {
  if (draft.version !== expectedVersion) return draft;
  // Only the acknowledged operation's immediate next version can safely advance
  // the other form's base. A replay after someone else's changes requires review.
  const version = updated.version === expectedVersion + 1 ? updated.version : draft.version;
  return action === "update"
    ? { ...draft, version, reason: updated.reason, notes: updated.notes, symptoms: [...updated.symptoms], triage: updated.triage }
    : { ...draft, version, value: "", rectifiesId: "", rectificationReason: "", measuredAt: localMeasurementTime() };
}
