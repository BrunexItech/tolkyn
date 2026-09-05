import { cn } from "@/lib/utils";
import type { ReactNode, CSSProperties } from "react";

export type CardAccent =
  | "default"
  | "blue"
  | "green"
  | "amber"
  | "cyan"
  | "violet"
  | "red";

const ACCENT: Record<CardAccent, { border: string; edge: string }> = {
  default: { border: "rgba(86,118,214,.14)", edge: "rgba(79,122,255,.22)" },
  blue: { border: "rgba(79,122,255,.24)", edge: "rgba(79,122,255,.4)" },
  green: { border: "rgba(34,197,94,.22)", edge: "rgba(34,197,94,.38)" },
  amber: { border: "rgba(245,182,66,.22)", edge: "rgba(245,182,66,.38)" },
  cyan: { border: "rgba(34,211,238,.22)", edge: "rgba(34,211,238,.38)" },
  violet: { border: "rgba(139,123,240,.24)", edge: "rgba(139,123,240,.4)" },
  red: { border: "rgba(240,82,75,.22)", edge: "rgba(240,82,75,.38)" },
};

interface CardProps {
  children: ReactNode;
  accent?: CardAccent;
  className?: string;
  style?: CSSProperties;
  noEdge?: boolean;
}

/** Tolkyn panel: card body + subtle gradient top-edge highlight. */
export function Card({ children, accent = "default", className, style, noEdge }: CardProps) {
  const a = ACCENT[accent];
  return (
    <div
      className={cn(
        "om-edge relative overflow-hidden rounded-xl border bg-om-card px-3.5 py-3 shadow-[0_1px_2px_rgba(0,0,0,.25)]",
        noEdge && "before:hidden",
        className,
      )}
      style={
        {
          borderColor: a.border,
          "--om-edge-color": a.edge,
          ...style,
        } as CSSProperties
      }
    >
      {children}
    </div>
  );
}

interface CardTitleProps {
  children: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  color?: string;
  className?: string;
}

/** Card heading row: optional leading icon, title, trailing action. */
export function CardTitle({ children, icon, action, color, className }: CardTitleProps) {
  return (
    <div
      className={cn(
        "mb-2.5 flex items-center gap-1.5 text-[12.5px] font-semibold tracking-tight",
        className,
      )}
      style={color ? { color } : undefined}
    >
      {icon != null && (
        <span className="grid size-4 shrink-0 place-items-center text-om-muted [&_svg]:size-[15px]">
          {icon}
        </span>
      )}
      <span className="truncate">{children}</span>
      {action != null && <span className="ml-auto flex items-center gap-1.5">{action}</span>}
    </div>
  );
}
