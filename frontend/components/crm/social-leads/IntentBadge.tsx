import { Flame, TrendingUp, Snowflake, MinusCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SocialLeadIntent } from "@/lib/api/socialLeads";

const MAP: Record<
  SocialLeadIntent,
  { label: string; cls: string; Icon: typeof Flame }
> = {
  hot: {
    label: "Hot",
    cls: "bg-om-red/12 text-om-red border-om-red/25",
    Icon: Flame,
  },
  warm: {
    label: "Warm",
    cls: "bg-om-amber/12 text-om-amber border-om-amber/25",
    Icon: TrendingUp,
  },
  cold: {
    label: "Cold",
    cls: "bg-om-blue/12 text-om-blue border-om-blue/25",
    Icon: Snowflake,
  },
  none: {
    label: "Not a lead",
    cls: "bg-white/[0.05] text-om-muted border-om-border",
    Icon: MinusCircle,
  },
};

export function IntentBadge({
  intent,
  className,
}: {
  intent: SocialLeadIntent;
  className?: string;
}) {
  const s = MAP[intent] ?? MAP.none;
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
    </span>
  );
}
