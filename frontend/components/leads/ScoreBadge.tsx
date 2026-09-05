import { Flame, Thermometer, Snowflake, HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LeadScore } from "@/lib/api/leads";

const MAP: Record<LeadScore, { label: string; cls: string; Icon: typeof Flame }> = {
  hot: { label: "Hot", cls: "bg-om-red/12 text-om-red border-om-red/25", Icon: Flame },
  warm: { label: "Warm", cls: "bg-om-amber/12 text-om-amber border-om-amber/25", Icon: Thermometer },
  cold: { label: "Cold", cls: "bg-om-blue/12 text-om-blue border-om-blue/25", Icon: Snowflake },
  unknown: { label: "Unscored", cls: "bg-white/[0.04] text-om-muted border-om-border", Icon: HelpCircle },
};

export function ScoreBadge({
  score,
  confidence,
  className,
}: {
  score: LeadScore;
  confidence?: number | null;
  className?: string;
}) {
  const s = MAP[score] ?? MAP.unknown;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10.5px] font-semibold",
        s.cls,
        className,
      )}
    >
      <s.Icon className="size-3" />
      {s.label}
      {confidence != null && (
        <span className="ml-0.5 font-mono opacity-70">{Math.round(confidence)}</span>
      )}
    </span>
  );
}
