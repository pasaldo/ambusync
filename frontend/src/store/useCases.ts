import { create } from "zustand";
import type { CaseRecord, CaseStatus, TriageLevel } from "@/types";
import { makeSeedCases } from "@/data/seed";
import { connect, loadCases, publish, type SyncPayload } from "./sync";

function nextId() {
  // Id resistente a colisiones entre pestañas (cada una transmite por su lado).
  return `CASE-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`.toUpperCase();
}

export interface NewCaseInput {
  ambulanceCode: string;
  hospitalName: string;
  patient: CaseRecord["patient"];
  vitals: CaseRecord["vitals"];
  triage: TriageLevel;
  etaMinutes: number;
}

interface CasesState {
  cases: CaseRecord[];
  /** id del último caso transmitido (para resaltar la entrada en el tablero) */
  lastTransmittedId: string | null;
  addCase: (input: NewCaseInput) => CaseRecord;
  updateStatus: (id: string, status: CaseStatus) => void;
  removeCase: (id: string) => void;
  seedDemo: () => void;
  clearAll: () => void;
}

// Evita reenviar a la red lo que justo acabamos de recibir de otra pestaña.
let applyingRemote = false;

export const useCases = create<CasesState>((set, get) => {
  /** Aplica un cambio local: actualiza el estado, persiste y difunde. */
  function commit(cases: CaseRecord[], lastTransmittedId?: string | null) {
    const next: Partial<CasesState> = { cases };
    if (lastTransmittedId !== undefined) next.lastTransmittedId = lastTransmittedId;
    set(next);
    if (!applyingRemote) {
      publish({ cases, lastTransmittedId: get().lastTransmittedId });
    }
  }

  return {
    cases: loadCases() ?? [],
    lastTransmittedId: null,

    addCase: (input) => {
      const now = Date.now();
      const record: CaseRecord = {
        id: nextId(),
        ambulanceCode: input.ambulanceCode,
        hospitalName: input.hospitalName,
        patient: input.patient,
        vitals: input.vitals,
        triage: input.triage,
        status: "transmitido",
        createdAt: now,
        etaMinutes: input.etaMinutes,
        etaTarget: now + input.etaMinutes * 60_000,
      };
      commit([record, ...get().cases], record.id);
      return record;
    },

    updateStatus: (id, status) =>
      commit(get().cases.map((c) => (c.id === id ? { ...c, status } : c))),

    removeCase: (id) => commit(get().cases.filter((c) => c.id !== id)),

    seedDemo: () => {
      // Solo siembra si no hay datos (de esta pestaña ni de otra ya abierta).
      if (get().cases.length > 0) return;
      commit(makeSeedCases());
    },

    clearAll: () => commit([], null),
  };
});

// Conecta la red de sincronización entre pestañas.
connect(
  (payload: SyncPayload) => {
    // Aplica el estado entrante sin volver a difundirlo (evita bucles).
    applyingRemote = true;
    try {
      useCases.setState({
        cases: payload.cases,
        lastTransmittedId: payload.lastTransmittedId,
      });
    } finally {
      applyingRemote = false;
    }
  },
  () => {
    const s = useCases.getState();
    return { cases: s.cases, lastTransmittedId: s.lastTransmittedId };
  },
);
