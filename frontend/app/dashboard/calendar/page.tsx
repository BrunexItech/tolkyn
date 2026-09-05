"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  endOfMonth,
  endOfWeek,
  format,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { CalendarDays, PlayCircle, Loader2, Plus, FileText, Trash2 } from "lucide-react";
import { SectionHeading } from "@/components/om/primitives/SectionHeading";
import { Grid } from "@/components/om/primitives/Grid";
import { StatTile } from "@/components/om/primitives/StatTile";
import { Card, CardTitle } from "@/components/om/primitives/Card";
import { EmptyState } from "@/components/om/primitives/EmptyState";
import { OmButton } from "@/components/om/primitives/OmButton";
import { Drawer } from "@/components/om/primitives/Drawer";
import { StatusBadge, type BadgeTone } from "@/components/om/primitives/StatusBadge";
import { CalendarGrid } from "@/components/calendar/CalendarGrid";
import { useCalendarPosts, usePostsSummary, useRunScheduler, useAllPosts, useDeletePost } from "@/components/calendar/hooks";
import { platform as findPlatform } from "@/lib/om/platforms";
import type { Post } from "@/lib/api/posts";
import { shortDateTime } from "@/lib/om/format";

const TONE: Record<string, BadgeTone> = {
  draft: "muted",
  scheduled: "blue",
  published: "green",
  partial: "amber",
  failed: "red",
  needs_approval: "amber",
  publishing: "blue",
};

export default function CalendarPage() {
  const [month, setMonth] = useState(new Date());
  const [day, setDay] = useState<{ date: Date; posts: Post[] } | null>(null);

  // widen to the full visible grid so posts on adjacent-month days show too
  const start = startOfWeek(startOfMonth(month), { weekStartsOn: 1 }).toISOString();
  const end = endOfWeek(endOfMonth(month), { weekStartsOn: 1 }).toISOString();
  const { data } = useCalendarPosts(start, end);
  const { data: summary } = usePostsSummary();
  const { data: all } = useAllPosts();
  const run = useRunScheduler();
  const del = useDeletePost();

  const drafts = useMemo(
    () => (all?.items ?? []).filter((p) => p.status === "draft").slice(0, 8),
    [all],
  );

  return (
    <div className="om-anim-rise space-y-3">
      <SectionHeading
        title="Content Calendar"
        subtitle="Everything scheduled and published, by day"
        icon={<CalendarDays />}
        actions={
          <>
            <OmButton asChild variant="outline" size="sm">
              <Link href="/dashboard/publishing">
                <Plus /> New post
              </Link>
            </OmButton>
            <OmButton variant="solid" size="sm" onClick={() => run.mutate()} disabled={run.isPending}>
              {run.isPending ? <Loader2 className="animate-spin" /> : <PlayCircle />}
              Publish due
            </OmButton>
          </>
        }
      />

      <Grid cols={4}>
        <StatTile label="Scheduled" value={summary?.scheduled ?? "—"} icon={<CalendarDays />} color="var(--om-blue)" />
        <StatTile label="Published" value={summary?.published ?? "—"} icon={<PlayCircle />} color="var(--om-green)" />
        <StatTile label="Drafts" value={summary?.draft ?? "—"} icon={<FileText />} color="var(--om-amber)" />
        <StatTile label="Failed" value={summary?.failed ?? "—"} icon={<Trash2 />} color="var(--om-red)" />
      </Grid>

      <div className="grid gap-3 lg:grid-cols-[1fr_300px]">
        <Card noEdge>
          <CalendarGrid
            month={month}
            onMonthChange={setMonth}
            posts={data?.items ?? []}
            onSelectDay={(date, posts) => setDay({ date, posts })}
          />
        </Card>

        <Card>
          <CardTitle icon={<FileText />}>Drafts</CardTitle>
          {drafts.length === 0 ? (
            <EmptyState title="No drafts">
              <Link href="/dashboard/publishing" className="text-om-blue underline">
                Start one
              </Link>
            </EmptyState>
          ) : (
            <div className="flex flex-col gap-1.5">
              {drafts.map((p) => (
                <Link
                  key={p.id}
                  href="/dashboard/publishing"
                  className="rounded-md border border-om-border bg-white/[0.02] px-2 py-1.5 text-[11px] hover:border-om-blue/40"
                >
                  <div className="truncate text-om-dim">{p.body || "Untitled"}</div>
                  <div className="mt-0.5 flex items-center gap-1 text-[9px] text-om-muted">
                    {p.platforms.map((pid) => {
                      const pl = findPlatform(pid);
                      return pl ? <pl.Icon key={pid} className="size-2.5" style={{ color: pl.color }} /> : null;
                    })}
                    {p.checks && !p.checks.ok && (
                      <span className="text-om-red">· {p.checks.errors} to fix</span>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Drawer
        open={!!day}
        onOpenChange={(v) => !v && setDay(null)}
        title={day ? format(day.date, "EEEE, MMM d") : ""}
        subtitle={day ? `${day.posts.length} post${day.posts.length === 1 ? "" : "s"}` : ""}
      >
        {day?.posts.length === 0 ? (
          <EmptyState title="Nothing on this day">
            <Link href="/dashboard/publishing" className="text-om-blue underline">
              Schedule a post
            </Link>
          </EmptyState>
        ) : (
          day?.posts.map((p) => {
            const when = p.published_at ?? p.scheduled_at;
            const results = Object.entries(p.per_platform || {});
            return (
              <div key={p.id} className="rounded-lg border border-om-border bg-white/[0.02] p-3">
                <div className="mb-1 flex items-center gap-2">
                  <span className="font-mono text-[11px] text-om-blue">
                    {when ? format(new Date(when), "HH:mm") : "—"}
                  </span>
                  <StatusBadge tone={TONE[p.status] ?? "muted"}>
                    {p.status === "published" ? "Live" : p.status.replace("_", " ")}
                  </StatusBadge>
                  <button
                    onClick={() => del.mutate(p.id)}
                    className="ml-auto grid size-6 place-items-center rounded text-om-muted hover:text-om-red"
                  >
                    <Trash2 className="size-3" />
                  </button>
                </div>
                <p className="whitespace-pre-wrap text-[11.5px] text-om-dim">{p.body}</p>

                {results.length > 0 ? (
                  <div className="mt-1.5 flex flex-col gap-0.5">
                    {results.map(([pid, r]) => {
                      const pl = findPlatform(pid);
                      const ok = r.status === "published" || r.status === "scheduled";
                      return (
                        <span key={pid} className="flex items-center gap-1 text-[10px]">
                          {pl && (
                            <pl.Icon className="size-3 shrink-0" style={{ color: pl.color }} />
                          )}
                          <span className="text-om-muted">{pl?.name ?? pid}</span>
                          {ok && r.url ? (
                            <a
                              href={r.url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-om-green hover:underline"
                            >
                              View live ↗
                            </a>
                          ) : ok ? (
                            <span className="text-om-green">posted</span>
                          ) : (
                            <span className="text-om-red">{r.error || "failed"}</span>
                          )}
                        </span>
                      );
                    })}
                  </div>
                ) : (
                  <div className="mt-1.5 flex items-center gap-1.5">
                    {p.platforms.map((pid) => {
                      const pl = findPlatform(pid);
                      return pl ? (
                        <span key={pid} className="text-[10px]" style={{ color: pl.color }}>
                          <pl.Icon className="inline size-3" /> {pl.name}
                        </span>
                      ) : null;
                    })}
                  </div>
                )}

                {p.status === "published" && p.published_at && (
                  <div className="mt-1.5 text-[9.5px] text-om-faint">
                    Went live {shortDateTime(p.published_at)}
                  </div>
                )}
              </div>
            );
          })
        )}
      </Drawer>
    </div>
  );
}
