import { motion } from "framer-motion";
import { X, MapPin, Radio, Clock, Stethoscope, CheckCircle2 } from "lucide-react";
import type { CaseRecord } from "@/types";
import { STATUS_META, NEXT_ACTION } from "@/data/status";
import { VitalsStrip } from "@/components/VitalsStrip";
import { TriageBadge } from "@/components/TriageBadge";
import { EtaCountdown } from "@/components/EtaCountdown";
import { Button } from "@/components/ui/Button";
import { useCases } from "@/store/useCases";

const SEX_LABEL: Record<string, string> = { F: "Femenino", M: "Masculino", X: "No registrado" };

export function CaseDetail({ record, onClose }: { record: CaseRecord; onClose: () => void }) {
  const updateStatus = useCases((s) => s.updateStatus);
  const status = STATUS_META[record.status];
  const next = NEXT_ACTION[record.status];
  const done = record.status === "recibido";

  return (
    <>
      {/* Telón */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 z-40 bg-black/60"
      />
      {/* Hoja deslizante */}
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", stiffness: 360, damping: 36 }}
        className="absolute inset-x-0 bottom-0 z-50 flex max-h-[92%] flex-col rounded-t-3xl bg-ink-800 text-white ring-1 ring-white/10"
      >
        {/* Asa + cerrar */}
        <div className="relative shrink-0 px-5 pt-3">
          <div className="mx-auto h-1 w-10 rounded-full bg-white/20" />
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="absolute right-4 top-2 flex h-9 w-9 items-center justify-center rounded-full bg-white/5 text-muted-dark hover:bg-white/10"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="no-scrollbar flex-1 overflow-y-auto px-5 pb-4 pt-2">
          {/* Identidad */}
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-mono text-xs text-muted-dark">
                {record.patient.age ?? "––"} años · {SEX_LABEL[record.patient.sex]}
              </p>
              <h2 className="text-2xl font-bold leading-tight">{record.patient.alias}</h2>
            </div>
            <TriageBadge level={record.triage} />
          </div>

          {/* Motivo */}
          <div className="mt-3 flex items-start gap-2 rounded-xl bg-white/5 p-3">
            <Stethoscope className="mt-0.5 h-4 w-4 shrink-0 text-muted-dark" />
            <p className="text-sm">{record.patient.chiefComplaint || "Sin motivo registrado"}</p>
          </div>

          {/* Síntomas */}
          {record.patient.symptoms.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {record.patient.symptoms.map((s) => (
                <span key={s} className="rounded-full bg-white/5 px-2.5 py-1 text-xs text-muted-dark ring-1 ring-white/10">
                  {s}
                </span>
              ))}
            </div>
          )}

          {/* ETA + estado */}
          <div className="mt-4 grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-white/5 p-3">
              <p className="mb-1 flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-muted-dark">
                <Clock className="h-3 w-3" /> ETA
              </p>
              <EtaCountdown target={record.etaTarget} tone="dark" size="lg" />
            </div>
            <div className="rounded-xl bg-white/5 p-3">
              <p className="mb-1 font-mono text-[10px] uppercase tracking-wider text-muted-dark">Estado</p>
              <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-sm font-medium ${status.chip}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />
                {status.label}
              </span>
            </div>
          </div>

          {/* Vitales */}
          <div className="mt-4">
            <p className="mb-1.5 font-mono text-[11px] uppercase tracking-widest text-muted-dark">
              Signos vitales
            </p>
            <VitalsStrip vitals={record.vitals} tone="dark" />
          </div>

          {/* Origen */}
          <div className="mt-4 space-y-px overflow-hidden rounded-xl text-sm ring-1 ring-white/10">
            <div className="flex items-center gap-2 bg-white/5 px-3 py-2.5">
              <MapPin className="h-4 w-4 shrink-0 text-muted-dark" />
              <span className="truncate">{record.hospitalName}</span>
            </div>
            <div className="flex items-center gap-2 bg-white/5 px-3 py-2.5">
              <Radio className="h-4 w-4 shrink-0 text-muted-dark" />
              <span className="font-mono">{record.ambulanceCode}</span>
            </div>
          </div>
        </div>

        {/* Acciones */}
        <div className="shrink-0 space-y-2 border-t border-white/10 bg-ink-800/95 px-5 py-3 backdrop-blur">
          {done ? (
            <div className="flex items-center justify-center gap-2 rounded-xl bg-triage-4/15 py-3 text-sm font-semibold text-triage-4">
              <CheckCircle2 className="h-5 w-5" />
              Paciente recibido en Urgencias
            </div>
          ) : (
            <div className="flex gap-2">
              {record.status === "transmitido" && (
                <Button
                  variant="outline"
                  className="flex-1 border-white/15 bg-white/5 text-white hover:bg-white/10"
                  onClick={() => updateStatus(record.id, "preparando")}
                >
                  Preparar box
                </Button>
              )}
              {next && (
                <Button className="flex-1" onClick={() => updateStatus(record.id, next.to)}>
                  {next.label}
                </Button>
              )}
            </div>
          )}
        </div>
      </motion.div>
    </>
  );
}
