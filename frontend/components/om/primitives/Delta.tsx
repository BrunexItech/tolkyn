import { cn } from "@/lib/utils";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";

interface DeltaProps {
  /** percentage value; sign drives colour + arrow */
  value: number;
  className?: string;
  /** treat a downward move as good (e.g. cost, opt-outs) */
  invert?: boolean;
  suffix?: string;
}

/** Compact up/down metric-change chip. */
export function Delta({ value, className, invert, suffix = "%" }: DeltaProps) {
  const flat = Math.abs(value) < 0.05;
  const good = invert ? value < 0 : value > 0;
  const Icon = flat ? Minus : value > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-md px-1 py-px font-mono text-[10.5px] font-semibold",
        flat
          ? "bg-white/[0.04] text-om-muted"
          : good
            ? "bg-om-green/10 text-om-green"
            : "bg-om-red/10 text-om-red",
        className,
      )}
    >
      <Icon className="size-3" />
      {value > 0 ? "+" : ""}
      {value.toFixed(1)}
      {suffix}
    </span>
  );
}
