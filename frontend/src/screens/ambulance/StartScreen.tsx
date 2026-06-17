import { motion } from "framer-motion";
import { Plus, ArrowLeft, Activity, CheckCircle2 } from "lucide-react";
import { Logo } from "@/components/Logo";
import { useCases } from "@/store/useCases";

export function StartScreen({ onNew, onExit }: { onNew: () => void; onExit: () => void }) {
  const myCases = useCases((s) =>
    s.cases.filter((c) => !c.id.startsWith("SEED-")),
  );

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex min-h-0 flex-1 flex-col px-5 pb-5"
    >
      {/* Cabecera */}
      <header className="flex items-center justify-between py-1">
        <Logo size={26} />
        <button
          onClick={onExit}
          className="flex h-9 items-center gap-1 rounded-full px-2 text-sm text-muted hover:bg-ink/5"
        >
          <ArrowLeft className="h-4 w-4" /> Roles
        </button>
      </header>

      {/* Estado de la unidad */}
      <div className="mt-3 rounded-2xl border border-ink/10 bg-white p-4 shadow-card">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-widest text-muted">Unidad</p>
            <p className="font-mono text-xl font-bold tabular text-ink">SAMU-12</p>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-triage-4/15 px-3 py-1 text-sm font-semibold text-triage-4">
            <span className="h-2 w-2 rounded-full bg-triage-4" />
            Disponible
          </span>
        </div>
        <div className="mt-3 flex items-center gap-2 border-t border-ink/5 pt-3 text-sm text-muted">
          <Activity className="h-4 w-4 text-signal" />
          <span>Enlace con Urgencias activo</span>
        </div>
      </div>

      {/* CTA principal */}
      <div className="mt-5 flex flex-1 flex-col items-center justify-center text-center">
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={onNew}
          className="group flex h-44 w-44 flex-col items-center justify-center gap-3 rounded-full bg-signal text-ink shadow-[0_20px_50px_-12px_rgba(0,181,216,0.6)]"
        >
          <Plus className="h-12 w-12" strokeWidth={2.5} />
          <span className="text-lg font-bold">Nueva emergencia</span>
        </motion.button>
        <p className="mt-5 max-w-[16rem] text-sm text-muted">
          Captura al paciente paso a paso y transmítelo a Urgencias en segundos.
        </p>
      </div>

      {/* Transmisiones de esta sesión */}
      {myCases.length > 0 && (
        <div className="mt-3">
          <p className="mb-2 font-mono text-[11px] uppercase tracking-widest text-muted">
            Transmitidos en esta sesión
          </p>
          <div className="space-y-1.5">
            {myCases.slice(0, 2).map((c) => (
              <div
                key={c.id}
                className="flex items-center gap-2 rounded-xl bg-surface-sunk px-3 py-2 text-sm"
              >
                <CheckCircle2 className="h-4 w-4 shrink-0 text-triage-4" />
                <span className="flex-1 truncate text-ink">{c.patient.alias}</span>
                <span className="font-mono text-xs text-muted">{c.patient.chiefComplaint}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );
}
