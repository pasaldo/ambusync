import type { Sex, TriageLevel, Vitals } from "@/types";
import { DEMO_HOSPITAL } from "@/data/seed";

export interface Draft {
  alias: string;
  age: string; // se mantiene como texto en el form
  sex: Sex;
  chiefComplaint: string;
  symptoms: string[];
  vitals: Vitals;
  triage: TriageLevel | null;
  hospitalName: string;
  ambulanceCode: string;
  etaMinutes: number;
}

export function emptyDraft(): Draft {
  return {
    alias: "",
    age: "",
    sex: "F",
    chiefComplaint: "",
    symptoms: [],
    vitals: {
      hr: null,
      bpSys: null,
      bpDia: null,
      spo2: null,
      rr: null,
      tempC: null,
      glasgow: null,
      takenAt: Date.now(),
    },
    triage: null,
    hospitalName: DEMO_HOSPITAL,
    ambulanceCode: "SAMU-12",
    etaMinutes: 8,
  };
}

/** Borrador de ejemplo precargado para el modo demo guionado. */
export function scriptedCriticalDraft(): Draft {
  return {
    alias: "Paciente Ejemplo A",
    age: "63",
    sex: "M",
    chiefComplaint: "Dolor torácico con sospecha de IAM",
    symptoms: ["Sudoración fría", "Disnea", "Náuseas"],
    vitals: {
      hr: 128,
      bpSys: 88,
      bpDia: 58,
      spo2: 88,
      rr: 27,
      tempC: 36.3,
      glasgow: 14,
      takenAt: Date.now(),
    },
    triage: 1,
    hospitalName: DEMO_HOSPITAL,
    ambulanceCode: "SAMU-12",
    etaMinutes: 5,
  };
}
