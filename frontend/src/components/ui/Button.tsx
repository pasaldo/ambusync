import { forwardRef } from "react";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "ghost" | "outline" | "dark" | "danger";
type Size = "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-signal text-ink font-semibold shadow-[0_6px_20px_-6px_rgba(0,181,216,0.6)] hover:bg-signal-soft active:translate-y-px",
  dark: "bg-ink text-white hover:bg-ink-700 active:translate-y-px",
  outline:
    "border border-ink/15 bg-white text-ink hover:bg-surface-sunk active:translate-y-px",
  ghost: "bg-transparent text-ink hover:bg-ink/5 active:translate-y-px",
  danger: "bg-triage-1 text-white hover:brightness-110 active:translate-y-px",
};

const SIZES: Record<Size, string> = {
  // Controles grandes (mín. 44px) para uso con guantes.
  md: "h-11 px-4 text-sm rounded-xl",
  lg: "h-14 px-5 text-base rounded-2xl",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        "inline-flex select-none items-center justify-center gap-2 whitespace-nowrap font-medium",
        "transition-all duration-150 disabled:pointer-events-none disabled:opacity-40",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    />
  ),
);
Button.displayName = "Button";
