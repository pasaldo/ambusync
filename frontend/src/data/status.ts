import type { CaseStatus } from "@/types";

export interface StatusMeta {
  label: string;
  /** clases para chip en modo oscuro */
  chip: string;
  dot: string;
}

export const STATUS_META: Record<CaseStatus, StatusMeta> = {
  capturando: { label: "Capturando", chip: "bg-white/10 text-muted-dark", dot: "bg-muted-dark" },
  transmitido: { label: "En camino", chip: "bg-signal/15 text-signal-soft", dot: "bg-signal" },
  aceptado: { label: "Aceptado", chip: "bg-triage-5/15 text-triage-5", dot: "bg-triage-5" },
  preparando: { label: "Box en preparación", chip: "bg-triage-3/15 text-triage-3", dot: "bg-triage-3" },
  recibido: { label: "Recibido", chip: "bg-triage-4/15 text-triage-4", dot: "bg-triage-4" },
};

/** Orden de avance del flujo en Urgencias. */
export const NEXT_ACTION: Partial<Record<CaseStatus, { to: CaseStatus; label: string }>> = {
  transmitido: { to: "aceptado", label: "Aceptar paciente" },
  aceptado: { to: "preparando", label: "Preparar box" },
  preparando: { to: "recibido", label: "Marcar recibido" },
};
