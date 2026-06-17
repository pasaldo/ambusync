// Modelo de datos del MVP (sección 5 de la hoja de ruta).
// `Case` es el objeto que "viaja" de la ambulancia a Urgencias.

export type Sex = "F" | "M" | "X";

export interface Patient {
  alias: string;
  age: number | null;
  sex: Sex;
  chiefComplaint: string;
  symptoms: string[];
}

export interface Vitals {
  hr: number | null; // frecuencia cardíaca (lpm)
  bpSys: number | null; // presión sistólica
  bpDia: number | null; // presión diastólica
  spo2: number | null; // saturación O2 (%)
  rr: number | null; // frecuencia respiratoria (rpm)
  tempC: number | null; // temperatura (°C)
  glasgow: number | null; // escala de Glasgow (3-15)
  takenAt: number; // epoch ms
}

export type TriageLevel = 1 | 2 | 3 | 4 | 5;

export type CaseStatus =
  | "capturando"
  | "transmitido"
  | "aceptado"
  | "preparando"
  | "recibido";

export interface CaseRecord {
  id: string;
  ambulanceCode: string;
  hospitalName: string;
  patient: Patient;
  vitals: Vitals;
  triage: TriageLevel;
  status: CaseStatus;
  createdAt: number; // epoch ms en que se transmitió
  etaMinutes: number; // ETA al transmitir
  /** epoch ms en que se cumple la ETA (createdAt + etaMinutes). Permite countdown vivo. */
  etaTarget: number;
}
