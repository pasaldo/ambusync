import type { CaseRecord, TriageLevel } from "@/types";

interface SeedSpec {
  alias: string;
  age: number;
  sex: CaseRecord["patient"]["sex"];
  chiefComplaint: string;
  symptoms: string[];
  triage: TriageLevel;
  etaMinutes: number;
  ambulanceCode: string;
  vitals: Omit<CaseRecord["vitals"], "takenAt">;
  status: CaseRecord["status"];
}

const HOSPITAL = "Hospital del Salvador — Urgencia";

// Casos de demo con triage variado para que el tablero se vea vivo en capturas.
const SPECS: SeedSpec[] = [
  {
    alias: "Paciente Bravo",
    age: 58,
    sex: "M",
    chiefComplaint: "Dolor torácico opresivo",
    symptoms: ["Sudoración", "Disnea", "Dolor irradiado a brazo izq."],
    triage: 1,
    etaMinutes: 4,
    ambulanceCode: "SAMU-12",
    status: "transmitido",
    vitals: { hr: 124, bpSys: 90, bpDia: 60, spo2: 89, rr: 26, tempC: 36.4, glasgow: 14 },
  },
  {
    alias: "Paciente Lima",
    age: 31,
    sex: "F",
    chiefComplaint: "Politraumatismo por colisión",
    symptoms: ["Fractura expuesta", "Dolor abdominal"],
    triage: 2,
    etaMinutes: 7,
    ambulanceCode: "SAMU-07",
    status: "aceptado",
    vitals: { hr: 112, bpSys: 104, bpDia: 68, spo2: 94, rr: 22, tempC: 36.8, glasgow: 15 },
  },
  {
    alias: "Paciente Sol",
    age: 74,
    sex: "F",
    chiefComplaint: "Déficit motor súbito (sospecha ACV)",
    symptoms: ["Hemiparesia derecha", "Disartria"],
    triage: 2,
    etaMinutes: 11,
    ambulanceCode: "SAMU-03",
    status: "transmitido",
    vitals: { hr: 88, bpSys: 178, bpDia: 96, spo2: 96, rr: 18, tempC: 36.6, glasgow: 13 },
  },
  {
    alias: "Paciente Nieve",
    age: 22,
    sex: "M",
    chiefComplaint: "Crisis asmática",
    symptoms: ["Sibilancias", "Uso de musculatura accesoria"],
    triage: 3,
    etaMinutes: 9,
    ambulanceCode: "SAMU-21",
    status: "transmitido",
    vitals: { hr: 102, bpSys: 128, bpDia: 80, spo2: 92, rr: 24, tempC: 37.1, glasgow: 15 },
  },
];

/**
 * Genera los casos de demo. Usa un `base` epoch fijo relativo a "ahora" para que
 * el countdown de ETA arranque coherente sin depender de timestamps guardados.
 */
export function makeSeedCases(): CaseRecord[] {
  const now = Date.now();
  return SPECS.map((spec, i) => {
    // Distribuye los createdAt en el pasado reciente para variar el countdown.
    const createdAt = now - (i + 1) * 45_000;
    return {
      id: `SEED-${1 + i}`,
      ambulanceCode: spec.ambulanceCode,
      hospitalName: HOSPITAL,
      patient: {
        alias: spec.alias,
        age: spec.age,
        sex: spec.sex,
        chiefComplaint: spec.chiefComplaint,
        symptoms: spec.symptoms,
      },
      vitals: { ...spec.vitals, takenAt: createdAt },
      triage: spec.triage,
      status: spec.status,
      createdAt,
      etaMinutes: spec.etaMinutes,
      etaTarget: now + spec.etaMinutes * 60_000,
    } satisfies CaseRecord;
  });
}

export const DEMO_HOSPITAL = HOSPITAL;
