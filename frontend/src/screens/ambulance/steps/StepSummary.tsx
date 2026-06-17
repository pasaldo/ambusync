import { MapPin, Clock, User, Radio } from "lucide-react";
import { TriageBadge } from "@/components/TriageBadge";
import { VitalsStrip } from "@/components/VitalsStrip";
import type { Draft } from "../draft";

const SEX_LABEL: Record<string, string> = { F: "Femenino", M: "Masculino", X: "No registrado" };

export function StepSummary({ draft }: { draft: Draft }) {
  return (
    <div className="space-y-3 pt-1">
      <p className="text-sm text-muted">Revisa antes de transmitir. Esto verá el equipo de Urgencias.</p>

      <div className="overflow-hidden rounded-2xl border border-ink/10 bg-white shadow-card">
        {/* Encabezado */}
        <div className="flex items-start justify-between gap-2 p-4 pb-3">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-muted">
              <User className="h-4 w-4" />
              <span className="font-mono text-xs">
                {draft.age || "––"} · {SEX_LABEL[draft.sex]}
              </span>
            </div>
            <h2 className="mt-0.5 text-lg font-bold leading-tight text-ink">
              {draft.alias.trim() || "Paciente sin alias"}
            </h2>
            <p className="text-sm text-muted">{draft.chiefComplaint || "Sin motivo registrado"}</p>
          </div>
          {draft.triage && <TriageBadge level={draft.triage} />}
        </div>

        {/* Síntomas */}
        {draft.symptoms.length > 0 && (
          <div className="flex flex-wrap gap-1.5 px-4 pb-3">
            {draft.symptoms.map((s) => (
              <span key={s} className="rounded-full bg-surface-sunk px-2.5 py-1 text-xs text-ink">
                {s}
              </span>
            ))}
          </div>
        )}

        {/* Vitales */}
        <div className="px-4 pb-4">
          <VitalsStrip vitals={draft.vitals} tone="light" />
        </div>

        {/* Destino + ETA */}
        <div className="grid grid-cols-2 gap-px bg-ink/10 text-sm">
          <div className="flex items-center gap-2 bg-white px-4 py-3">
            <MapPin className="h-4 w-4 shrink-0 text-muted" />
            <span className="truncate text-ink">{draft.hospitalName}</span>
          </div>
          <div className="flex items-center gap-2 bg-white px-4 py-3">
            <Clock className="h-4 w-4 shrink-0 text-muted" />
            <span className="font-mono font-semibold tabular text-ink">
              ETA {String(draft.etaMinutes).padStart(2, "0")}:00
            </span>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-center gap-2 rounded-xl bg-signal/10 px-3 py-2.5 text-sm text-signal-deep">
        <Radio className="h-4 w-4" />
        <span>
          Transmitir desde <span className="font-mono font-semibold">{draft.ambulanceCode}</span>
        </span>
      </div>
    </div>
  );
}
