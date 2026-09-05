import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export type BadgeTone = "green" | "blue" | "amber" | "red" | "violet" | "muted";

const TONE: Record<BadgeTone, string> = {
  green: "bg-om-green/10 text-om-green border-om-green/20",
  blue: "bg-om-blue/10 text-om-blue border-om-blue/20",
  amber: "bg-om-amber/10 text-om-amber border-om-amber/20",
  red: "bg-om-red/10 text-om-red border-om-red/20",
  violet: "bg-om-violet/10 text-om-violet border-om-violet/20",
  muted: "bg-white/[0.04] text-om-dim border-om-border",
};

/** Pill badge for statuses (Draft / Scheduled / Live / Failed …). */
export function StatusBadge({
  children,
  tone = "muted",
  icon,
  className,
}: {
  children: ReactNode;
  tone?: BadgeTone;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold [&_svg]:size-2.5",
        TONE[tone],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}
