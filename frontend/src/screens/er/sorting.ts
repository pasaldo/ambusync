import type { CaseRecord } from "@/types";

/**
 * Ordena los casos del tablero: triage ascendente (1 = más grave primero)
 * y, a igual triage, por ETA más próxima.
 */
export function sortCases(cases: CaseRecord[]): CaseRecord[] {
  return [...cases].sort((a, b) => {
    if (a.triage !== b.triage) return a.triage - b.triage;
    return a.etaTarget - b.etaTarget;
  });
}

/** Casos aún activos en el tablero (los recibidos pasan a un historial aparte). */
export function isIncoming(c: CaseRecord): boolean {
  return c.status !== "recibido";
}
