import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface FieldProps {
  label: string;
  hint?: string;
  htmlFor?: string;
  children: ReactNode;
  className?: string;
}

export function Field({ label, hint, htmlFor, children, className }: FieldProps) {
  return (
    <label htmlFor={htmlFor} className={cn("block", className)}>
      <span className="mb-1.5 flex items-baseline justify-between">
        <span className="text-sm font-semibold text-ink">{label}</span>
        {hint && <span className="text-xs text-muted">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

interface TextInputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

export function TextInput({ className, ...props }: TextInputProps) {
  return (
    <input
      className={cn(
        "h-12 w-full rounded-xl border border-ink/15 bg-white px-3.5 text-base text-ink",
        "placeholder:text-muted/60 focus:border-signal focus:ring-2 focus:ring-signal/30",
        "transition-colors outline-none",
        className,
      )}
      {...props}
    />
  );
}

interface TextAreaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

export function TextArea({ className, ...props }: TextAreaProps) {
  return (
    <textarea
      className={cn(
        "w-full rounded-xl border border-ink/15 bg-white px-3.5 py-2.5 text-base text-ink",
        "placeholder:text-muted/60 focus:border-signal focus:ring-2 focus:ring-signal/30",
        "transition-colors outline-none resize-none",
        className,
      )}
      {...props}
    />
  );
}
