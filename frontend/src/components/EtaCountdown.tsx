import { useNow } from "@/lib/useNow";
import { formatEta } from "@/lib/utils";
import { cn } from "@/lib/utils";

interface EtaCountdownProps {
  /** epoch ms en que se cumple la ETA */
  target: number;
  tone?: "light" | "dark";
  size?: "sm" | "md" | "lg";
  className?: string;
}

/** Countdown de ETA que decrece en vivo (mono tabular). */
export function EtaCountdown({ target, tone = "dark", size = "md", className }: EtaCountdownProps) {
  const now = useNow(1000);
  const secondsLeft = (target - now) / 1000;
  const arrived = secondsLeft <= 0;
  const urgent = secondsLeft > 0 && secondsLeft <= 120;

  const sizeClass =
    size === "lg" ? "text-3xl" : size === "sm" ? "text-sm" : "text-xl";

  return (
    <span
      className={cn(
        "tabular inline-flex items-baseline gap-1 font-mono font-bold leading-none",
        sizeClass,
        arrived
          ? "text-signal"
          : urgent
            ? "text-triage-2"
            : tone === "dark"
              ? "text-white"
              : "text-ink",
        urgent && !arrived && "animate-blink",
        className,
      )}
      aria-label={arrived ? "Arribando" : `ETA ${formatEta(secondsLeft)} minutos`}
    >
      {arrived ? "ARRIBANDO" : formatEta(secondsLeft)}
    </span>
  );
}
