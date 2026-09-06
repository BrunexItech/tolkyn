"use client";

import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { ThreadList } from "./ThreadList";
import { ThreadView } from "./ThreadView";
import type { InboxFilters, ThreadSummary } from "@/lib/api/inbox";

/** Master–detail conversation layout, responsive by design.
 *  - ≥ lg  : list and thread side by side.
 *  - < lg  : one pane at a time — the list, then the open thread with a
 *            "back" affordance. No more 260px list squeezed next to a
 *            100px-wide message column on a phone. */
export function InboxSplit({
  filters,
  onChange,
  selected,
  onSelect,
  gridClassName = "lg:grid-cols-[340px_1fr]",
}: {
  filters: InboxFilters;
  onChange: (p: Partial<InboxFilters>) => void;
  selected: string | null;
  onSelect: (id: string | null) => void;
  /** the ≥lg column template; the base layout is always a single column */
  gridClassName?: string;
}) {
  return (
    <div className={cn("grid min-h-0 flex-1 gap-3", gridClassName)}>
      <div className={cn("min-h-0", selected ? "hidden lg:block" : "block")}>
        <ThreadList
          filters={filters}
          onChange={onChange}
          selectedId={selected}
          onSelect={(t: ThreadSummary) => onSelect(t.id)}
        />
      </div>

      <div className={cn("min-h-0 flex-col", selected ? "flex" : "hidden lg:flex")}>
        {selected && (
          <button
            onClick={() => onSelect(null)}
            className="mb-2 inline-flex w-fit items-center gap-1.5 text-[12px] font-medium text-om-muted transition-colors hover:text-om-text lg:hidden"
          >
            <ArrowLeft className="size-3.5" /> All conversations
          </button>
        )}
        <div className="min-h-0 flex-1">
          <ThreadView threadId={selected} />
        </div>
      </div>
    </div>
  );
}
