import type { Draft } from "../draft";

export interface StepMeta {
  title: string;
  requiredHint?: string;
}

export const STEP_META: StepMeta[] = [
  { title: "Datos del paciente", requiredHint: "Indica el motivo de consulta para continuar." },
  { title: "Signos vitales", requiredHint: "Registra al menos FC y SatO₂." },
  { title: "Clasificación de triage", requiredHint: "Selecciona un nivel de triage." },
  { title: "Destino y ETA" },
  { title: "Resumen" },
];

/** Validación simple por paso para habilitar "Continuar". */
export function canAdvance(step: number, d: Draft): boolean {
  switch (step) {
    case 0:
      return d.chiefComplaint.trim().length > 2;
    case 1:
      return d.vitals.hr !== null && d.vitals.spo2 !== null;
    case 2:
      return d.triage !== null;
    case 3:
      return d.etaMinutes > 0 && d.hospitalName.trim().length > 0;
    default:
      return true;
  }
}
