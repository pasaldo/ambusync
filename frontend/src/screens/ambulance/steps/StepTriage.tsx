import { Check } from "lucide-react";
import { TRIAGE, TRIAGE_LEVELS } from "@/data/triage";
import type { Draft } from "../draft";
import { cn } from "@/lib/utils";

export function StepTriage({
  draft,
  update,
}: {
  draft: Draft;
  update: (patch: Partial<Draft>) => void;
}) {
  return (
    <div className="space-y-3 pt-1">
      <p className="text-sm text-muted">
        Clasifica la gravedad. El color viaja con el paciente al tablero.
      </p>

      <div className="space-y-2.5">
        {TRIAGE_LEVELS.map((lvl) => {
          const t = TRIAGE[lvl];
          const active = draft.triage === lvl;
          return (
            <button
              key={lvl}
              type="button"
              onClick={() => update({ triage: lvl })}
              aria-pressed={active}
              className={cn(
                "flex w-full items-center gap-3 rounded-2xl border-2 bg-white p-3 text-left transition-all",
                active ? "shadow-card" : "border-transparent hover:border-ink/10",
              )}
              style={active ? { borderColor: t.color } : undefined}
            >
              <span
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl font-mono text-lg font-bold text-white"
                style={{ backgroundColor: t.color }}
              >
                {lvl}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-ink">{t.label}</span>
                <span className="block font-mono text-xs text-muted">Categoría {t.short}</span>
              </span>
              {active && (
                <span
                  className="flex h-7 w-7 items-center justify-center rounded-full text-white"
                  style={{ backgroundColor: t.color }}
                >
                  <Check className="h-4 w-4" strokeWidth={3} />
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
