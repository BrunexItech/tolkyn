"use client";

import Link from "next/link";
import { CalendarClock, ArrowRight } from "lucide-react";
import { Card, CardTitle } from "@/components/om/primitives/Card";
import { EmptyState } from "@/components/om/primitives/EmptyState";
import { StatusBadge, type BadgeTone } from "@/components/om/primitives/StatusBadge";
import { platform as findPlatform } from "@/lib/om/platforms";
import { relativeTime } from "@/lib/om/format";
import { useAllPosts } from "./hooks";

const STATUS: Record<string, { tone: BadgeTone; label: string }> = {
  scheduled: { tone: "blue", label: "Scheduled" },
  publishing: { tone: "blue", label: "Publishing" },
  needs_approval: { tone: "amber", label: "Needs approval" },
  draft: { tone: "muted", label: "Draft" },
};

export function UpcomingCard() {
  const { data } = useAllPosts();
  const upcoming = (data?.items ?? [])
    .filter((p) => p.status === "scheduled" || p.status === "needs_approval")
    .sort((a, b) => (a.scheduled_at ?? "").localeCompare(b.scheduled_at ?? ""))
    .slice(0, 6);

  return (
    <Card>
      <CardTitle
        icon={<CalendarClock />}
        action={
          <Link
            href="/dashboard/calendar"
            className="flex items-center gap-1 text-[10.5px] font-medium text-om-blue hover:underline"
          >
            Calendar <ArrowRight className="size-3" />
          </Link>
        }
      >
        Upcoming posts
      </CardTitle>
      {upcoming.length === 0 ? (
        <EmptyState title="Nothing scheduled">
          <Link href="/dashboard/publishing" className="text-om-blue underline">
            Schedule a post
          </Link>
        </EmptyState>
      ) : (
        <div className="flex flex-col">
          {upcoming.map((p) => {
            const s = STATUS[p.status] ?? STATUS.draft;
            return (
              <div
                key={p.id}
                className="flex items-center gap-3 border-b border-white/[0.04] py-2 last:border-0"
              >
                <div className="flex -space-x-1">
                  {p.platforms.map((c) => {
                    const pl = findPlatform(c);
                    if (!pl) return null;
                    const { Icon } = pl;
                    return (
                      <span
                        key={c}
                        className="grid size-5 place-items-center rounded-md border border-om-bg"
                        style={{ background: `${pl.color}24` }}
                      >
                        <Icon className="size-2.5" style={{ color: pl.color }} />
                      </span>
                    );
                  })}
                </div>
                <span className="flex-1 truncate text-[12px] text-om-text">
                  {p.body || p.title || "Untitled"}
                </span>
                <span className="hidden shrink-0 font-mono text-[10.5px] text-om-muted sm:block">
                  {p.scheduled_at ? relativeTime(p.scheduled_at) : ""}
                </span>
                <StatusBadge tone={s.tone}>{s.label}</StatusBadge>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
