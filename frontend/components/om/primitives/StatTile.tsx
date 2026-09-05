import { cn } from "@/lib/utils";
import type { ReactNode } from "react";
import { Delta } from "./Delta";

interface StatTileProps {
  label: ReactNode;
  value: ReactNode;
  icon?: ReactNode;
  color?: string;
  delta?: number;
  deltaInvert?: boolean;
  className?: string;
  compact?: boolean;
  /** Show a shimmer where the value would be, until data arrives. */
  loading?: boolean;
}

/** Metric tile: label + icon, big mono value, optional delta chip. */
export function StatTile({
  label,
  value,
  icon,
  color = "var(--om-text)",
  delta,
  deltaInvert,
  className,
  compact,
  loading,
}: StatTileProps) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl border border-om-border bg-om-card",
        compact ? "p-2.5" : "p-3",
        className,
      )}
    >
      <span
        className="pointer-events-none absolute -right-3 -top-3 size-14 rounded-full opacity-[0.14] blur-2xl"
        style={{ background: color }}
      />
      <div className="mb-1 flex items-center gap-1.5 text-[10.5px] font-medium text-om-muted">
        {icon != null && <span className="[&_svg]:size-3.5" style={{ color }}>{icon}</span>}
        <span className="truncate">{label}</span>
      </div>
      <div className="flex items-end justify-between gap-2">
        {loading ? (
          <div className={cn("om-skel", compact ? "mt-0.5 h-3.5 w-12" : "mt-1 h-4 w-16")} />
        ) : (
          <span
            className={cn("font-mono font-bold leading-none", compact ? "text-[15px]" : "text-[19px]")}
            style={{ color }}
          >
            {value}
          </span>
        )}
        {!loading && delta !== undefined && <Delta value={delta} invert={deltaInvert} />}
      </div>
    </div>
  );
}
