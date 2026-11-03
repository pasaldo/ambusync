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
  { key: "spo2", label: "SatO₂", unit: "" },
  { key: "rr", label: "FR", unit: "rpm" },
  { key: "tempC", label: "Temp", unit: "" },
  { key: "glasgow", label: "Glasgow", unit: "" },
];

/**
 * Clasifica los signos vitales para lectura rápida en las tarjetas.
 * Verde = rango esperado; amarillo = desviación cercana; rojo = desviación crítica.
 */
export function statusFor(key: keyof Vitals, value: number | null): VitalStatus {
  if (value === null || Number.isNaN(value)) return "normal";
  switch (key) {
    case "hr":
      if (value < 40 || value > 130) return "crit";
      if (value < 60 || value > 80) return "warn";
      return "normal";
    case "spo2":
      if (value < 90) return "crit";
      if (value < 95) return "warn";
      return "normal";
    case "rr":
      if (value < 8 || value > 30) return "crit";
      if (value < 12 || value > 20) return "warn";
      return "normal";
    case "tempC":
      if (value < 34 || value > 40) return "crit";
      if (value < 36 || value > 37.5) return "warn";
      return "normal";
    case "glasgow":
      if (value <= 8) return "crit";
      if (value < 15) return "warn";
      return "normal";
    case "bpSys":
      if (value < 90 || value > 200) return "crit";
      if (value !== 120) return "warn";
      return "normal";
    case "bpDia":
      if (value < 50 || value > 90) return "crit";
      if (value !== 80) return "warn";
      return "normal";
    default:
      return "normal";
  }
}

export const VITAL_STATUS_CLASS: Record<VitalStatus, string> = {
  normal: "text-triage-4",
  warn: "text-triage-3",
  crit: "text-triage-1",
};
