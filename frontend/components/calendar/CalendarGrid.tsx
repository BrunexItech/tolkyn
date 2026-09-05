"use client";

import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { platform as findPlatform } from "@/lib/om/platforms";
import type { Post } from "@/lib/api/posts";

const STATUS_RING: Record<string, string> = {
  scheduled: "border-om-blue/50",
  publishing: "border-om-blue/50",
  published: "border-om-green/50 bg-om-green/[0.06]",
  partial: "border-om-amber/50",
  failed: "border-om-red/50",
  draft: "border-om-border",
};

const DOT: Record<string, string> = {
  scheduled: "bg-om-blue",
  publishing: "bg-om-blue",
  published: "bg-om-green",
  partial: "bg-om-amber",
  failed: "bg-om-red",
};

/** The day a post belongs on: when it went live, else when it's scheduled. */
export function postDate(p: Post): Date | null {
  const iso = p.published_at ?? p.scheduled_at;
  return iso ? new Date(iso) : null;
}

export function CalendarGrid({
  month,
  onMonthChange,
  posts,
  onSelectDay,
}: {
  month: Date;
  onMonthChange: (d: Date) => void;
  posts: Post[];
  onSelectDay: (day: Date, dayPosts: Post[]) => void;
}) {
  const gridStart = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
  const gridEnd = endOfWeek(endOfMonth(month), { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });

  const byDay = (d: Date) =>
    posts.filter((p) => {
      const pd = postDate(p);
      return pd && isSameDay(pd, d);
    });

  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <div className="text-[13px] font-semibold">{format(month, "MMMM yyyy")}</div>
        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={() => onMonthChange(addMonths(month, -1))}
            className="grid size-7 place-items-center rounded-md border border-om-border text-om-muted hover:text-om-text"
          >
            <ChevronLeft className="size-3.5" />
          </button>
          <button
            onClick={() => onMonthChange(new Date())}
            className="rounded-md border border-om-border px-2 py-1 text-[10.5px] text-om-muted hover:text-om-text"
          >
            Today
          </button>
          <button
            onClick={() => onMonthChange(addMonths(month, 1))}
            className="grid size-7 place-items-center rounded-md border border-om-border text-om-muted hover:text-om-text"
          >
            <ChevronRight className="size-3.5" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 text-[9px] font-semibold uppercase tracking-wide text-om-faint">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <div key={d} className="px-1 py-1">
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {days.map((d) => {
          const dp = byDay(d);
          const inMonth = isSameMonth(d, month);
          return (
            <button
              key={d.toISOString()}
              onClick={() => onSelectDay(d, dp)}
              className={cn(
                "flex min-h-[86px] flex-col gap-1 rounded-lg border p-1.5 text-left transition-colors",
                inMonth ? "border-om-border bg-white/[0.015]" : "border-transparent opacity-40",
                "hover:border-om-blue/40",
              )}
            >
              <span
                className={cn(
                  "text-[10px] font-medium",
                  isToday(d) ? "grid size-4 place-items-center rounded-full bg-om-blue text-white" : "text-om-muted",
                )}
              >
                {format(d, "d")}
              </span>
              <div className="flex flex-col gap-0.5">
                {dp.slice(0, 3).map((p) => {
                  const first = findPlatform(p.platforms[0]);
                  const pd = postDate(p);
                  return (
                    <span
                      key={p.id}
                      className={cn(
                        "flex items-center gap-1 truncate rounded border px-1 py-0.5 text-[9px] text-om-dim",
                        STATUS_RING[p.status] ?? "border-om-border bg-white/[0.03]",
                      )}
                    >
                      <span
                        className={cn(
                          "size-1.5 shrink-0 rounded-full",
                          DOT[p.status] ?? "bg-om-muted",
                        )}
                      />
                      {first && (
                        <first.Icon className="size-2.5 shrink-0" style={{ color: first.color }} />
                      )}
                      {pd ? format(pd, "HH:mm") : ""} {p.body.slice(0, 12)}
                    </span>
                  );
                })}
                {dp.length > 3 && <span className="px-1 text-[9px] text-om-muted">+{dp.length - 3} more</span>}
              </div>
            </button>
          );
        })}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-3 text-[9.5px] text-om-muted">
        {[
          ["scheduled", "Scheduled"],
          ["published", "Live"],
          ["partial", "Partly failed"],
          ["failed", "Failed"],
        ].map(([k, label]) => (
          <span key={k} className="flex items-center gap-1">
            <span className={cn("size-1.5 rounded-full", DOT[k])} />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}
