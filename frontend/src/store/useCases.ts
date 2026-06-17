import { create } from "zustand";
import type { CaseRecord, CaseStatus, TriageLevel } from "@/types";
import { makeSeedCases } from "@/data/seed";

let idCounter = 1000;
function nextId() {
  idCounter += 1;
  return `CASE-${idCounter}`;
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

export const useCases = create<CasesState>((set) => ({
  cases: [],
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
    set((s) => ({
      cases: [record, ...s.cases],
      lastTransmittedId: record.id,
    }));
    return record;
  },

  updateStatus: (id, status) =>
    set((s) => ({
      cases: s.cases.map((c) => (c.id === id ? { ...c, status } : c)),
    })),

  removeCase: (id) =>
    set((s) => ({ cases: s.cases.filter((c) => c.id !== id) })),

  seedDemo: () =>
    set((s) => {
      // Evita duplicar la siembra si ya hay casos de demo.
      if (s.cases.some((c) => c.id.startsWith("SEED-"))) return s;
      return { cases: [...makeSeedCases(), ...s.cases] };
    }),

  clearAll: () => set({ cases: [], lastTransmittedId: null }),
}));
