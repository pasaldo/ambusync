export const VITAL_FIELDS = [
  { key: "hr", label: "Frecuencia cardíaca", unit: "lpm", step: "1" },
  { key: "bp_sys", label: "Presión sistólica", unit: "mmHg", step: "1" },
  { key: "bp_dia", label: "Presión diastólica", unit: "mmHg", step: "1" },
  { key: "spo2", label: "SpO₂", unit: "%", step: "0.01", max: "100" },
  { key: "rr", label: "Frecuencia respiratoria", unit: "rpm", step: "1" },
  { key: "temp_c", label: "Temperatura", unit: "°C", step: "0.1" },
  { key: "glasgow", label: "Glasgow", unit: "puntos", step: "1", min: "3", max: "15" },
] as const;

export interface EmergencyDraft {
  destinationId: string;
  patientId?: string;
  patientVersion?: number;
  identityUnknown: boolean;
  alias: string;
  ageValue: string;
  ageUnit: "" | "years" | "months" | "days";
  sex: "" | "F" | "M" | "X";
  reason: string;
  symptoms: string[];
  notes: string;
  triage: "" | "C1" | "C2" | "C3" | "C4" | "C5";
  transferStarted: boolean;
  vitals: Record<string, string>;
}

export function emptyDraft(): EmergencyDraft {
  return {
    destinationId: "", identityUnknown: true, alias: "", ageValue: "", ageUnit: "", sex: "",
    reason: "", symptoms: [], notes: "", triage: "", transferStarted: false,
    vitals: Object.fromEntries(VITAL_FIELDS.map(({ key }) => [key, ""])),
  };
}
