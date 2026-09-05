import { cn } from "@/lib/utils";
import type { ComponentProps, ReactNode } from "react";

const CONTROL =
  "w-full rounded-lg border border-om-border bg-white/[0.03] px-2.5 py-2 text-[12.5px] text-om-text outline-none transition-colors placeholder:text-om-muted focus:border-om-blue/70 focus:bg-white/[0.05] focus:ring-2 focus:ring-om-blue/15 disabled:opacity-50";

interface FieldProps {
  label?: ReactNode;
  children: ReactNode;
  className?: string;
  hint?: ReactNode;
}

/** Labelled form group. */
export function Field({ label, children, className, hint }: FieldProps) {
  return (
    <div className={cn("mb-2.5", className)}>
      {label != null && (
        <label className="mb-1 block text-[10.5px] font-semibold uppercase tracking-[0.05em] text-om-muted">
          {label}
        </label>
      )}
      {children}
      {hint != null && <div className="mt-1 text-[10.5px] text-om-muted">{hint}</div>}
    </div>
  );
}

export function OmInput({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(CONTROL, className)} {...props} />;
}

export function OmSelect({ className, children, ...props }: ComponentProps<"select">) {
  return (
    <select className={cn(CONTROL, "appearance-none pr-8", className)} {...props}>
      {children}
    </select>
  );
}

export function OmTextarea({ className, ...props }: ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(CONTROL, "min-h-[68px] resize-y leading-relaxed", className)}
      {...props}
    />
  );
}
