import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

interface StepperProps {
  label: string;
  unit?: string;
  value: number | null;
  min?: number;
  max?: number;
  step?: number;
  placeholder?: number;
  onChange: (value: number) => void;
  className?: string;
}

/** Entrada numérica con botones grandes +/- (uso con guantes) y valor en mono tabular. */
export function Stepper({
  label,
  unit,
  value,
  min = 0,
  max = 999,
  step = 1,
  placeholder,
  onChange,
  className,
}: StepperProps) {
  const current = value ?? placeholder ?? min;
  const set = (v: number) => onChange(Math.min(max, Math.max(min, Number(v.toFixed(1)))));

  return (
    <div className={cn("rounded-xl border border-ink/15 bg-white p-2.5", className)}>
      <div className="mb-1.5 flex items-baseline justify-between px-0.5">
        <span className="text-sm font-semibold text-ink">{label}</span>
        {unit && <span className="font-mono text-[11px] text-muted">{unit}</span>}
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label={`Disminuir ${label}`}
          onClick={() => set(current - step)}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-surface-sunk text-ink transition-colors hover:bg-ink/10 active:scale-95"
        >
          <Minus className="h-5 w-5" strokeWidth={2.5} />
        </button>
        <div className="flex-1 text-center">
          <span
            className={cn(
              "tabular font-mono text-2xl font-bold leading-none",
              value === null ? "text-muted/50" : "text-ink",
            )}
          >
            {value === null ? "––" : Number.isInteger(current) ? current : current.toFixed(1)}
          </span>
        </div>
        <button
          type="button"
          aria-label={`Aumentar ${label}`}
          onClick={() => set(current + step)}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-surface-sunk text-ink transition-colors hover:bg-ink/10 active:scale-95"
        >
          <Plus className="h-5 w-5" strokeWidth={2.5} />
        </button>
      </div>
    </div>
  );
}
