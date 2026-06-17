import { cn } from "@/lib/utils";

interface LogoProps {
  className?: string;
  /** alto en px del ícono */
  size?: number;
}

/** Marca AmbuSync: una traza de monitor cardíaco en acento cian (la "señal"). */
export function Logo({ className, size = 28 }: LogoProps) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 32 32"
        fill="none"
        aria-hidden="true"
        className="shrink-0"
      >
        <rect width="32" height="32" rx="8" fill="#0E1726" />
        <path
          d="M3 16 h5 l2.5 -7 l4 14 l3 -10 l2.2 5 h6.3"
          stroke="#00B5D8"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span className="text-[19px] font-bold tracking-tight">
        Ambu<span className="text-signal">Sync</span>
      </span>
    </span>
  );
}
