import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

/**
 * Table styling wrapper. Wrap a plain `<table>` — cell styles are scoped so
 * panels can write ordinary table markup.
 */
export function TableWrap({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "om-scroll overflow-x-auto",
        "[&_table]:w-full [&_table]:border-collapse [&_table]:text-[11.5px]",
        "[&_thead_th]:border-b [&_thead_th]:border-om-border [&_thead_th]:px-2 [&_thead_th]:py-1.5 [&_thead_th]:text-left [&_thead_th]:text-[9.5px] [&_thead_th]:font-semibold [&_thead_th]:uppercase [&_thead_th]:tracking-[0.06em] [&_thead_th]:text-om-muted",
        "[&_tbody_td]:border-b [&_tbody_td]:border-white/[0.04] [&_tbody_td]:px-2 [&_tbody_td]:py-2 [&_tbody_td]:text-om-text",
        "[&_tbody_tr:last-child_td]:border-0 [&_tbody_tr:hover_td]:bg-white/[0.03]",
        className,
      )}
    >
      {children}
    </div>
  );
}
