import type { Vitals } from "@/types";
import { VITAL_SPECS, statusFor, VITAL_STATUS_CLASS } from "@/data/vitals";
import { cn } from "@/lib/utils";

interface VitalsStripProps {
  vitals: Vitals;
  tone?: "light" | "dark";
  /** compacta para tarjetas del tablero */
  dense?: boolean;
  className?: string;
}

function fmt(value: number | null): string {
  if (value === null || Number.isNaN(value)) return "––";
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

/**
 * Tira de signos vitales — el elemento firma del diseño.
 * Mono tabular para que los números no "salten". El color resalta lo anormal.
 */
export function VitalsStrip({ vitals, tone = "light", dense = false, className }: VitalsStripProps) {
  const isDark = tone === "dark";
  // PA va aparte (dos números) y abre la tira.
  const cells = [
    {
      label: "PA",
      unit: "mmHg",
      display: `${fmt(vitals.bpSys)}/${fmt(vitals.bpDia)}`,
      status: statusFor("bpSys", vitals.bpSys),
    },
    ...VITAL_SPECS.map((s) => ({
      label: s.label,
      unit: s.unit,
      display: fmt(vitals[s.key] as number | null),
      status: statusFor(s.key, vitals[s.key] as number | null),
    })),
  ];

  return (
    <div
      className={cn(
        "grid grid-cols-6 overflow-hidden rounded-xl border",
        isDark ? "border-white/10 bg-white/[0.03]" : "border-ink/10 bg-surface-sunk/60",
        className,
      )}
      role="group"
      aria-label="Signos vitales"
    >
      {cells.map((c, i) => (
        <div
          key={c.label}
          className={cn(
            "flex flex-col items-center justify-center gap-0.5 px-1",
            dense ? "py-1.5" : "py-2.5",
            i !== 0 && (isDark ? "border-l border-white/10" : "border-l border-ink/10"),
          )}
        >
          <span
            className={cn(
              "font-mono font-medium uppercase tracking-wide",
              dense ? "text-[9px]" : "text-[10px]",
              isDark ? "text-muted-dark" : "text-muted",
            )}
          >
            {c.label}
          </span>
          <span
            className={cn(
              "tabular font-mono font-bold leading-none",
              dense ? "text-sm" : "text-base",
              isDark ? "text-white" : "text-ink",
              c.status !== "normal" && VITAL_STATUS_CLASS[c.status],
            )}
          >
            {c.display}
          </span>
          {!dense && c.unit && (
            <span className={cn("font-mono text-[9px]", isDark ? "text-muted-dark/70" : "text-muted/70")}>
              {c.unit}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
