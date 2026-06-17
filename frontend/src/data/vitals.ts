import type { Vitals } from "@/types";

export type VitalStatus = "normal" | "warn" | "crit";

export interface VitalSpec {
  key: keyof Vitals;
  label: string;
  unit: string;
}

// Orden y etiquetas de la tira de signos vitales (elemento firma del diseño).
export const VITAL_SPECS: VitalSpec[] = [
  { key: "hr", label: "FC", unit: "lpm" },
  { key: "spo2", label: "SatO₂", unit: "%" },
  { key: "rr", label: "FR", unit: "rpm" },
  { key: "tempC", label: "Temp", unit: "°C" },
  { key: "glasgow", label: "Glasgow", unit: "" },
];

/** Clasifica un valor para resaltar lo anormal (rojo/ámbar) en el monitor. */
export function statusFor(key: keyof Vitals, value: number | null): VitalStatus {
  if (value === null || Number.isNaN(value)) return "normal";
  switch (key) {
    case "hr":
      if (value < 40 || value > 130) return "crit";
      if (value < 50 || value > 110) return "warn";
      return "normal";
    case "spo2":
      if (value < 88) return "crit";
      if (value < 93) return "warn";
      return "normal";
    case "rr":
      if (value < 8 || value > 30) return "crit";
      if (value < 12 || value > 24) return "warn";
      return "normal";
    case "tempC":
      if (value >= 39.5 || value < 35) return "crit";
      if (value >= 38 || value < 36) return "warn";
      return "normal";
    case "glasgow":
      if (value <= 8) return "crit";
      if (value <= 13) return "warn";
      return "normal";
    case "bpSys":
      if (value < 90 || value > 200) return "crit";
      if (value < 100 || value > 160) return "warn";
      return "normal";
    default:
      return "normal";
  }
}

export const VITAL_STATUS_CLASS: Record<VitalStatus, string> = {
  normal: "text-inherit",
  warn: "text-triage-3",
  crit: "text-triage-1",
};
