import type { TriageLevel } from "@/types";

export interface TriageMeta {
  level: TriageLevel;
  label: string;
  short: string;
  color: string; // hex del token
  /** clases utilitarias precomputadas para evitar concatenación dinámica que Tailwind no detecta */
  bg: string;
  text: string;
  ring: string;
  dot: string;
}

// El color codifica gravedad (no decora). Escala chilena de triage 1–5.
export const TRIAGE: Record<TriageLevel, TriageMeta> = {
  1: {
    level: 1,
    label: "Crítico",
    short: "C1",
    color: "#E5392E",
    bg: "bg-triage-1",
    text: "text-triage-1",
    ring: "ring-triage-1",
    dot: "bg-triage-1",
  },
  2: {
    level: 2,
    label: "Emergencia",
    short: "C2",
    color: "#F2792B",
    bg: "bg-triage-2",
    text: "text-triage-2",
    ring: "ring-triage-2",
    dot: "bg-triage-2",
  },
  3: {
    level: 3,
    label: "Urgente",
    short: "C3",
    color: "#F5C518",
    bg: "bg-triage-3",
    text: "text-triage-3",
    ring: "ring-triage-3",
    dot: "bg-triage-3",
  },
  4: {
    level: 4,
    label: "Menos urgente",
    short: "C4",
    color: "#2FB67A",
    bg: "bg-triage-4",
    text: "text-triage-4",
    ring: "ring-triage-4",
    dot: "bg-triage-4",
  },
  5: {
    level: 5,
    label: "No urgente",
    short: "C5",
    color: "#3B82F6",
    bg: "bg-triage-5",
    text: "text-triage-5",
    ring: "ring-triage-5",
    dot: "bg-triage-5",
  },
};

export const TRIAGE_LEVELS: TriageLevel[] = [1, 2, 3, 4, 5];
