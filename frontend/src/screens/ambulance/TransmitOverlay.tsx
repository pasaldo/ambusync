import { motion } from "framer-motion";
import { Radio, CheckCircle2, HeartPulse, Plus, Home } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { TriageBadge } from "@/components/TriageBadge";
import type { Draft } from "./draft";

interface Props {
  phase: "sending" | "sent";
  draft: Draft;
  onSeeBoard: () => void;
  onNewCase: () => void;
  onBackHome: () => void;
}

export function TransmitOverlay({ phase, draft, onSeeBoard, onNewCase, onBackHome }: Props) {
  const sending = phase === "sending";

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="relative flex min-h-0 flex-1 flex-col items-center justify-center overflow-hidden bg-ink px-6 text-center text-white"
    >
      {/* Barrido de señal cian de fondo */}
      {sending && (
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute inset-x-0 h-1/2 bg-gradient-to-b from-signal/20 to-transparent animate-sweep" />
        </div>
      )}

      {/* Núcleo del pulso */}
      <div className="relative mb-8 flex h-40 w-40 items-center justify-center">
        {sending && (
          <>
            <span className="absolute h-40 w-40 rounded-full bg-signal/30 animate-pulse-ring" />
            <span
              className="absolute h-40 w-40 rounded-full bg-signal/20 animate-pulse-ring"
              style={{ animationDelay: "0.5s" }}
            />
          </>
        )}
        <motion.div
          initial={false}
          animate={{
            backgroundColor: sending ? "rgba(0,181,216,0.15)" : "rgba(47,182,122,0.15)",
            scale: sending ? 1 : 1.04,
          }}
          className="relative flex h-28 w-28 items-center justify-center rounded-full ring-1 ring-white/15"
        >
          {sending ? (
            <Radio className="h-12 w-12 text-signal animate-blink" />
          ) : (
            <motion.span
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 260, damping: 18 }}
            >
              <CheckCircle2 className="h-14 w-14 text-triage-4" />
            </motion.span>
          )}
        </motion.div>
      </div>

      {sending ? (
        <>
          <h2 className="text-xl font-bold">Transmitiendo al hospital…</h2>
          <p className="mt-1.5 max-w-xs text-sm text-muted-dark">
            Enviando paciente, vitales y triage a{" "}
            <span className="text-white">{draft.hospitalName}</span>
          </p>
          <div className="mt-4 flex items-center gap-2 font-mono text-xs text-muted-dark">
            <span className="h-1.5 w-1.5 animate-blink rounded-full bg-signal" />
            {draft.ambulanceCode} → Urgencias
          </div>
        </>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="w-full max-w-xs"
        >
          <h2 className="text-2xl font-bold">Transmitido</h2>
          <p className="mt-1.5 text-sm text-muted-dark">
            El equipo de Urgencias ya ve a este paciente en camino.
          </p>

          <div className="mt-5 flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 p-3.5 text-left">
            <div className="min-w-0">
              <p className="truncate font-semibold">{draft.alias.trim() || "Paciente sin alias"}</p>
              <p className="truncate text-sm text-muted-dark">{draft.chiefComplaint}</p>
            </div>
            {draft.triage && <TriageBadge level={draft.triage} showLabel={false} />}
          </div>

          <div className="mt-5 space-y-2.5">
            <Button size="lg" variant="primary" className="w-full" onClick={onSeeBoard}>
              <HeartPulse className="h-5 w-5" />
              Ver en el tablero de Urgencias
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1 border-white/15 bg-white/5 text-white hover:bg-white/10" onClick={onNewCase}>
                <Plus className="h-4 w-4" />
                Otra emergencia
              </Button>
              <Button variant="ghost" className="flex-1 text-muted-dark hover:bg-white/5" onClick={onBackHome}>
                <Home className="h-4 w-4" />
                Inicio
              </Button>
            </div>
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}
