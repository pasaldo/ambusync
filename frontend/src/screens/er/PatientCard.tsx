import { motion } from "framer-motion";
import { ChevronRight } from "lucide-react";
import type { CaseRecord } from "@/types";
import { TRIAGE } from "@/data/triage";
import { STATUS_META } from "@/data/status";
import { VitalsStrip } from "@/components/VitalsStrip";
import { EtaCountdown } from "@/components/EtaCountdown";

interface Props {
  record: CaseRecord;
  isNew: boolean;
  onOpen: () => void;
}

const SEX_SHORT: Record<string, string> = { F: "F", M: "M", X: "X" };

export function PatientCard({ record, isNew, onOpen }: Props) {
  const t = TRIAGE[record.triage];
  const status = STATUS_META[record.status];

  return (
    <motion.button
      layout
      // "Aterrizaje" del caso al entrar al tablero
      initial={isNew ? { opacity: 0, y: -18, scale: 0.96 } : false}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 320, damping: 26 }}
      onClick={onOpen}
      className="group relative block w-full overflow-hidden rounded-2xl bg-ink-800 text-left ring-1 ring-white/5 transition-colors hover:bg-ink-700"
    >
      {/* Barra de color de triage */}
      <span className="absolute inset-y-0 left-0 w-1.5" style={{ backgroundColor: t.color }} />
      {isNew && (
        <span className="absolute right-0 top-0 z-10 rounded-bl-lg bg-signal px-2 py-0.5 font-mono text-[10px] font-bold text-ink">
          NUEVO
        </span>
      )}

      <div className="py-3 pl-4 pr-3">
        {/* Fila superior */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span
                className="font-mono text-xs font-bold text-white"
                style={{ color: t.color }}
              >
                {t.short}
              </span>
              <span className="font-mono text-[11px] text-muted-dark">
                {record.patient.age ?? "––"} · {SEX_SHORT[record.patient.sex]}
              </span>
            </div>
            <h3 className="mt-0.5 truncate text-base font-bold leading-tight text-white">
              {record.patient.alias}
            </h3>
            <p className="truncate text-sm text-muted-dark">{record.patient.chiefComplaint}</p>
          </div>

          <div className="flex shrink-0 flex-col items-end gap-1">
            <span className="font-mono text-[10px] uppercase tracking-wider text-muted-dark">ETA</span>
            <EtaCountdown target={record.etaTarget} tone="dark" size="md" />
          </div>
        </div>

        {/* Vitales */}
        <div className="mt-2.5">
          <VitalsStrip vitals={record.vitals} tone="dark" dense />
        </div>

        {/* Pie: estado + unidad */}
        <div className="mt-2.5 flex items-center justify-between">
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${status.chip}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />
            {status.label}
          </span>
          <span className="flex items-center gap-1 font-mono text-[11px] text-muted-dark">
            {record.ambulanceCode}
            <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </span>
        </div>
      </div>
    </motion.button>
  );
}
