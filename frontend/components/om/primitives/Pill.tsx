import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export type PillTone = "green" | "blue" | "red" | "amber" | "muted";

const TONE: Record<PillTone, string> = {
  green: "bg-om-green/10 border-om-green/20 text-om-green",
  blue: "bg-om-blue/10 border-om-blue/20 text-om-blue",
  red: "bg-om-red/12 border-om-red/25 text-om-red",
  amber: "bg-om-amber/10 border-om-amber/20 text-om-amber",
  muted: "bg-white/[0.04] border-om-border text-om-dim",
};

const DOT: Record<PillTone, string> = {
  green: "bg-om-green",
  blue: "bg-om-blue",
  red: "bg-om-red",
  amber: "bg-om-amber",
  muted: "bg-om-muted",
};

interface PillProps {
  children: ReactNode;
  tone?: PillTone;
  dot?: boolean;
  icon?: ReactNode;
  className?: string;
}

/** Small status chip. */
export function Pill({ children, tone = "blue", dot, icon, className }: PillProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10.5px] font-semibold",
        TONE[tone],
        className,
      )}
    >
      {dot && <LiveDot className={DOT[tone]} />}
      {icon != null && <span className="[&_svg]:size-3">{icon}</span>}
      {children}
    </span>
  );
}

export function LiveDot({ className }: { className?: string }) {
  return (
    <span className={cn("om-live-dot inline-block size-[5px] rounded-full bg-om-green", className)} />
  );
}
