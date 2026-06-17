import type { TriageLevel } from "@/types";
import { TRIAGE } from "@/data/triage";
import { cn } from "@/lib/utils";

interface TriageBadgeProps {
  level: TriageLevel;
  size?: "sm" | "md";
  showLabel?: boolean;
  className?: string;
}

/** Insignia de triage. El número y el color comunican gravedad de un vistazo. */
export function TriageBadge({ level, size = "md", showLabel = true, className }: TriageBadgeProps) {
  const t = TRIAGE[level];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full font-semibold text-white",
        size === "sm" ? "px-2 py-0.5 text-xs" : "px-2.5 py-1 text-sm",
        className,
      )}
      style={{ backgroundColor: t.color }}
    >
      <span className="font-mono tabular font-bold">{t.short}</span>
      {showLabel && <span className="font-medium">{t.label}</span>}
    </span>
  );
}
