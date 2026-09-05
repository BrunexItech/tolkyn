"use client";

import { Search, MessageCircle, AtSign, Send, Star, Heart } from "lucide-react";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/om/primitives/EmptyState";
import { platform as findPlatform } from "@/lib/om/platforms";
import { useThreads } from "./hooks";
import type { InboxFilters, ThreadKind, ThreadSummary } from "@/lib/api/inbox";
import { relativeTime } from "@/lib/om/format";

const KIND_ICON: Record<ThreadKind, typeof MessageCircle> = {
  comment: MessageCircle,
  mention: AtSign,
  dm: Send,
  review: Star,
};

const SENTIMENT_DOT: Record<string, string> = {
  positive: "bg-om-green",
  neutral: "bg-om-muted",
  negative: "bg-om-red",
};

export function ThreadList({
  filters,
  onChange,
  selectedId,
  onSelect,
}: {
  filters: InboxFilters;
  onChange: (p: Partial<InboxFilters>) => void;
  selectedId: string | null;
  onSelect: (t: ThreadSummary) => void;
}) {
  const { data, isLoading } = useThreads(filters);
  const threads = data?.items ?? [];

  const chip = (label: string, val: InboxFilters[keyof InboxFilters] | undefined, key: keyof InboxFilters) => (
    <button
      onClick={() => onChange({ [key]: filters[key] === val ? undefined : val })}
      className={cn(
        "rounded-full border px-2 py-0.5 text-[10px] font-medium transition-colors",
        filters[key] === val
          ? "border-om-blue/40 bg-om-blue/12 text-om-blue"
          : "border-om-border text-om-muted hover:text-om-dim",
      )}
    >
      {label}
    </button>
  );

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-om-border bg-om-card">
      <div className="border-b border-om-border p-2.5">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-om-muted" />
          <input
            defaultValue={filters.search ?? ""}
            onChange={(e) => onChange({ search: e.target.value || undefined })}
            placeholder="Search conversations"
            className="w-full rounded-lg border border-om-border bg-white/[0.03] py-1.5 pl-8 pr-3 text-[12px] text-om-text outline-none placeholder:text-om-muted focus:border-om-blue/60"
          />
        </div>
        <div className="mt-2 flex flex-wrap gap-1">
          {chip("Open", "open", "status")}
          {chip("Done", "done", "status")}
          {chip("Comments", "comment", "kind")}
          {chip("Mentions", "mention", "kind")}
          {chip("DMs", "dm", "kind")}
        </div>
      </div>

      <div className="om-scroll flex-1 overflow-y-auto">
        {isLoading ? (
          <EmptyState title="Loading…" />
        ) : threads.length === 0 ? (
          <EmptyState icon={<MessageCircle />} title="Inbox zero">
            No conversations match this filter.
          </EmptyState>
        ) : (
          threads.map((t) => {
            const p = findPlatform(t.platform);
            const KindIcon = KIND_ICON[t.kind];
            return (
              <button
                key={t.id}
                onClick={() => onSelect(t)}
                className={cn(
                  "flex w-full gap-2.5 border-b border-white/[0.04] p-2.5 text-left transition-colors",
                  selectedId === t.id ? "bg-om-blue/[0.07]" : "hover:bg-white/[0.03]",
                )}
              >
                <div className="relative shrink-0">
                  <span className="grid size-8 place-items-center rounded-full bg-white/[0.05] text-[11px] font-bold text-om-dim">
                    {t.author_name.slice(0, 2).toUpperCase()}
                  </span>
                  {p && (
                    <span
                      className="absolute -bottom-0.5 -right-0.5 grid size-3.5 place-items-center rounded-full border border-om-card"
                      style={{ background: `${p.color}` }}
                    >
                      <p.Icon className="size-2 text-white" />
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className={cn("truncate text-[12px]", t.unread ? "font-semibold" : "font-medium text-om-dim")}>
                      {t.author_name}
                    </span>
                    {t.sentiment && (
                      <span className={cn("size-1.5 shrink-0 rounded-full", SENTIMENT_DOT[t.sentiment])} />
                    )}
                    <span className="ml-auto shrink-0 text-[9.5px] text-om-faint">
                      {t.last_message_at ? relativeTime(t.last_message_at) : ""}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 text-[10px] text-om-muted">
                    <KindIcon className="size-2.5" />
                    <span className="truncate">{t.context}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className={cn("min-w-0 flex-1 truncate text-[11px]", t.unread ? "text-om-text" : "text-om-muted")}>
                      {t.preview}
                    </div>
                    {t.like_count != null && t.like_count > 0 && (
                      <span className="flex shrink-0 items-center gap-0.5 text-[9.5px] text-om-faint">
                        <Heart className="size-2.5" /> {t.like_count}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
