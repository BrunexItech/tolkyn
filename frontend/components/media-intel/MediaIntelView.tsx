"use client";

import { useState } from "react";
import {
  Radar,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
  Activity,
  Building2,
  TrendingUp,
  AtSign,
  Newspaper,
} from "lucide-react";
import { Card, CardTitle } from "@/components/om/primitives/Card";
import { EmptyState } from "@/components/om/primitives/EmptyState";
import { OmButton } from "@/components/om/primitives/OmButton";
import { BriefView } from "./BriefView";
import { useWatches, useAdHocBrief, useAddWatch, useRefreshWatch, useDeleteWatch } from "./hooks";
import type { Brief, Watch, WatchKind } from "@/lib/api/mediaIntel";
import { relativeTime } from "@/lib/om/format";
import { cn } from "@/lib/utils";

const KINDS: { id: WatchKind; label: string; icon: typeof Activity }[] = [
  { id: "pulse", label: "Pulse", icon: Activity },
  { id: "trend", label: "Trend", icon: TrendingUp },
  { id: "competitor", label: "Competitor", icon: Building2 },
  { id: "brand", label: "Brand", icon: AtSign },
];

export function MediaIntelView() {
  const [topic, setTopic] = useState("");
  const [kind, setKind] = useState<WatchKind>("pulse");
  const [current, setCurrent] = useState<{ brief: Brief; watchId?: string } | null>(null);

  const { data: watchData } = useWatches();
  const adHoc = useAdHocBrief();
  const addWatch = useAddWatch();
  const refresh = useRefreshWatch();
  const del = useDeleteWatch();
  const watches = watchData?.items ?? [];

  const run = () => {
    if (topic.trim().length < 2) return;
    adHoc.mutate(
      { topic: topic.trim(), kind },
      { onSuccess: (r) => setCurrent({ brief: r.brief }) },
    );
  };

  const openWatch = (w: Watch) => {
    if (w.last_brief) setCurrent({ brief: w.last_brief, watchId: w.id });
  };

  return (
    <div className="grid gap-3 lg:grid-cols-[300px_1fr]">
      {/* left: watchlist + ask */}
      <div className="space-y-3">
        <Card>
          <CardTitle icon={<Radar />}>Ask</CardTitle>
          <div className="mb-2 grid grid-cols-4 gap-1">
            {KINDS.map((k) => (
              <button
                key={k.id}
                onClick={() => setKind(k.id)}
                className={cn(
                  "flex flex-col items-center gap-0.5 rounded-md border py-1.5 text-[9px] font-medium transition-colors",
                  kind === k.id
                    ? "border-om-blue/40 bg-om-blue/10 text-om-blue"
                    : "border-om-border text-om-muted hover:text-om-dim",
                )}
              >
                <k.icon className="size-3.5" />
                {k.label}
              </button>
            ))}
          </div>
          <textarea
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            rows={2}
            placeholder={
              kind === "competitor"
                ? "A competitor's name"
                : kind === "brand"
                  ? "Your brand name"
                  : "A topic, product area or industry"
            }
            className="w-full rounded-lg border border-om-border bg-white/[0.03] px-2.5 py-2 text-[12px] text-om-text outline-none focus:border-om-blue/60"
          />
          <div className="mt-2 flex gap-1.5">
            <OmButton variant="solid" size="sm" className="flex-1" onClick={run} disabled={adHoc.isPending}>
              {adHoc.isPending ? <Loader2 className="animate-spin" /> : <Radar />}
              {adHoc.isPending ? "Reading…" : "Get brief"}
            </OmButton>
            <OmButton
              variant="outline"
              size="sm"
              title="Track this topic"
              disabled={addWatch.isPending || topic.trim().length < 2}
              onClick={() =>
                addWatch.mutate({ topic: topic.trim(), kind }, { onSuccess: (w) => openWatch(w) })
              }
            >
              {addWatch.isPending ? <Loader2 className="animate-spin" /> : <Plus />}
            </OmButton>
          </div>
        </Card>

        <Card>
          <CardTitle icon={<Activity />}>Watchlist</CardTitle>
          {watches.length === 0 ? (
            <EmptyState title="Nothing tracked yet">
              Add a topic to get a refreshable brief.
            </EmptyState>
          ) : (
            <div className="flex flex-col gap-1">
              {watches.map((w) => (
                <div
                  key={w.id}
                  className={cn(
                    "flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-[11.5px] transition-colors",
                    current?.watchId === w.id
                      ? "border-om-blue/40 bg-om-blue/[0.06]"
                      : "border-om-border hover:bg-white/[0.03]",
                  )}
                >
                  <button onClick={() => openWatch(w)} className="min-w-0 flex-1 text-left">
                    <span className="block truncate font-medium">{w.topic}</span>
                    <span className="block truncate text-[9.5px] text-om-muted">
                      {w.kind} · {w.last_run_at ? relativeTime(w.last_run_at) : "—"}
                    </span>
                  </button>
                  <button
                    onClick={() =>
                      refresh.mutate(w.id, {
                        onSuccess: (nw) => nw.last_brief && setCurrent({ brief: nw.last_brief, watchId: nw.id }),
                      })
                    }
                    disabled={refresh.isPending}
                    className="grid size-6 place-items-center rounded text-om-muted hover:text-om-blue"
                  >
                    {refresh.isPending && refresh.variables === w.id ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : (
                      <RefreshCw className="size-3" />
                    )}
                  </button>
                  <button
                    onClick={() => {
                      del.mutate(w.id);
                      if (current?.watchId === w.id) setCurrent(null);
                    }}
                    className="grid size-6 place-items-center rounded text-om-muted hover:text-om-red"
                  >
                    <Trash2 className="size-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* right: brief */}
      <Card className="min-h-[420px]">
        {adHoc.isPending ? (
          <EmptyState icon={<Radar />} title="Reading the latest coverage…">
            Searching the web and synthesising a brief. A few seconds.
          </EmptyState>
        ) : current ? (
          <BriefView brief={current.brief} />
        ) : (
          <EmptyState icon={<Newspaper />} title="What's happening in your space?">
            Ask about a topic, a competitor, an emerging trend, or your own brand — Tolkyn
            pulls fresh coverage and turns it into an actionable brief.
          </EmptyState>
        )}
      </Card>
    </div>
  );
}
