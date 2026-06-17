import { MapPin, Clock } from "lucide-react";
import { Field, TextInput } from "@/components/ui/Field";
import type { Draft } from "../draft";
import { cn } from "@/lib/utils";

const ETA_PRESETS = [3, 5, 8, 12, 18];

export function StepDestination({
  draft,
  update,
}: {
  draft: Draft;
  update: (patch: Partial<Draft>) => void;
}) {
  return (
    <div className="space-y-4 pt-1">
      <Field label="Hospital de destino" htmlFor="hospital">
        <div className="relative">
          <MapPin className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" />
          <TextInput
            id="hospital"
            value={draft.hospitalName}
            onChange={(e) => update({ hospitalName: e.target.value })}
            className="pl-10"
          />
        </div>
      </Field>

      <Field label="Unidad" hint="ambulancia" htmlFor="unit">
        <TextInput
          id="unit"
          value={draft.ambulanceCode}
          onChange={(e) => update({ ambulanceCode: e.target.value })}
          className="font-mono"
        />
      </Field>

      <div>
        <div className="mb-2 flex items-center gap-1.5">
          <Clock className="h-4 w-4 text-muted" />
          <span className="text-sm font-semibold text-ink">ETA estimada</span>
        </div>
        <div className="grid grid-cols-5 gap-2">
          {ETA_PRESETS.map((m) => {
            const active = draft.etaMinutes === m;
            return (
              <button
                key={m}
                type="button"
                onClick={() => update({ etaMinutes: m })}
                className={cn(
                  "flex h-16 flex-col items-center justify-center rounded-xl border-2 transition-all",
                  active
                    ? "border-signal bg-signal/10"
                    : "border-ink/10 bg-white hover:border-ink/25",
                )}
              >
                <span className={cn("font-mono text-xl font-bold tabular", active ? "text-signal-deep" : "text-ink")}>
                  {m}
                </span>
                <span className="text-[10px] text-muted">min</span>
              </button>
            );
          })}
        </div>
        <div className="mt-3 flex items-center justify-between rounded-xl bg-surface-sunk px-3.5 py-3">
          <span className="text-sm text-muted">Llegada estimada en</span>
          <span className="font-mono text-lg font-bold tabular text-ink">
            {String(draft.etaMinutes).padStart(2, "0")}:00 min
          </span>
        </div>
      </div>
    </div>
  );
}
