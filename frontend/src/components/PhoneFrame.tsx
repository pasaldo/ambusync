import type { ReactNode } from "react";
import { Signal, Wifi, BatteryFull } from "lucide-react";
import { cn } from "@/lib/utils";

interface PhoneFrameProps {
  children: ReactNode;
  /** modo claro (ambulancia) u oscuro (urgencias) define color de la status bar */
  tone?: "light" | "dark";
  className?: string;
}

/**
 * "Device shell": en escritorio renderiza la app dentro de un marco de teléfono
 * (~390x844). En móvil ocupa toda la pantalla (el marco se desvanece).
 */
export function PhoneFrame({ children, tone = "light", className }: PhoneFrameProps) {
  const isDark = tone === "dark";
  return (
    <div className="flex min-h-[100dvh] w-full items-center justify-center sm:p-6">
      <div
        className={cn(
          // Móvil: pantalla completa. Escritorio (sm+): marco de teléfono.
          "relative flex h-[100dvh] w-full flex-col overflow-hidden bg-white",
          "sm:h-[844px] sm:max-h-[92vh] sm:w-[390px] sm:rounded-phone sm:shadow-phone",
          "sm:ring-[10px] sm:ring-black/85",
          isDark ? "bg-ink" : "bg-surface",
          className,
        )}
      >
        {/* Notch (solo escritorio) */}
        <div className="pointer-events-none absolute left-1/2 top-0 z-30 hidden -translate-x-1/2 sm:block">
          <div className="mt-2 h-6 w-32 rounded-full bg-black/85" />
        </div>

        {/* Status bar simulada */}
        <div
          className={cn(
            "relative z-20 flex h-11 shrink-0 items-center justify-between px-6 pt-1 text-xs font-semibold",
            isDark ? "text-white/90" : "text-ink/80",
          )}
        >
          <span className="font-mono tabular tracking-tight">09:41</span>
          <div className="flex items-center gap-1.5">
            <Signal className="h-3.5 w-3.5" strokeWidth={2.5} />
            <Wifi className="h-3.5 w-3.5" strokeWidth={2.5} />
            <BatteryFull className="h-4 w-4" strokeWidth={2} />
          </div>
        </div>

        {/* Contenido de la app */}
        <div className="relative z-10 flex min-h-0 flex-1 flex-col">{children}</div>

        {/* Home indicator (solo escritorio) */}
        <div className="pointer-events-none absolute bottom-1.5 left-1/2 z-30 hidden h-1 w-32 -translate-x-1/2 rounded-full sm:block"
          style={{ backgroundColor: isDark ? "rgba(255,255,255,0.35)" : "rgba(14,23,38,0.25)" }}
        />
      </div>
    </div>
  );
}
