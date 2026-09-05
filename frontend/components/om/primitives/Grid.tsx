import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

type Cols = 2 | 3 | 4;

const MAP: Record<Cols, string> = {
  2: "grid-cols-1 md:grid-cols-2 gap-3",
  3: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3",
  4: "grid-cols-2 lg:grid-cols-4 gap-2.5",
};

/** Responsive stat/card grids. */
export function Grid({
  cols,
  children,
  className,
}: {
  cols: Cols;
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn("grid", MAP[cols], className)}>{children}</div>;
}
