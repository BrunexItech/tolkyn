"use client";

import { useState } from "react";
import Link from "next/link";
import {
  CalendarClock,
  SendHorizontal,
  Loader2,
  CheckCircle2,
  CircleAlert,
  RotateCcw,
  RefreshCw,
  XCircle,
  Clock,
} from "lucide-react";
import { OmButton } from "@/components/om/primitives/OmButton";
import { platform as findPlatform } from "@/lib/om/platforms";
import { shortDateTime, relativeTime } from "@/lib/om/format";
import { Scheduler } from "./Scheduler";
import type { useComposerDraft } from "./useComposerDraft";

type Draft = ReturnType<typeof useComposerDraft>;

export function ScheduleBar({ draft }: { draft: Draft }) {
  const { post, form, checks, canGo, canAct, tz, scheduleAt, scheduling, unschedule, publish, refresh, reset } = draft;
  const [open, setOpen] = useState(false);

  const status = post?.status;
  const results = post ? Object.entries(post.per_platform) : [];
  const pending = results.filter(([, r]) => r.status === "publishing").length;

  const scheduler = (
    <Scheduler
      open={open}
      onOpenChange={setOpen}
      platforms={form.platforms}
      tz={tz}
      busy={scheduling}
      checks={checks}
      initial={post?.scheduled_at ?? null}
      onSchedule={async (iso) => {
        try {
          await scheduleAt(iso);
          setOpen(false);
        } catch {
          /* toast shown by the hook */
        }
      }}
    />
  );

  // ---- publishing / published / failed -------------------------------
  if (status === "published" || status === "partial" || status === "failed" || pending > 0) {
    return (
      <div className="rounded-xl border border-om-border-strong bg-om-bg2/95 p-3">
        <div className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold">
          {pending > 0 ? (
            <>
              <Loader2 className="size-4 animate-spin text-om-blue" />
              <span className="text-om-blue">Uploading to {pending} platform{pending === 1 ? "" : "s"}…</span>
            </>
          ) : status === "failed" ? (
            <>
              <XCircle className="size-4 text-om-red" /> <span className="text-om-red">Publish failed</span>
            </>
          ) : (
            <>
              <CheckCircle2 className="size-4 text-om-green" />
              <span className="text-om-green">{status === "partial" ? "Partly published" : "Published"}</span>
            </>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          {results.map(([pid, r]) => {
            const p = findPlatform(pid);
            const ok = r.status === "published";
            const isPending = r.status === "publishing";
            return (
              <a
                key={pid}
                href={ok && r.url ? r.url : undefined}
                target="_blank"
                rel="noreferrer"
                className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] ${
                  ok
                    ? "border-om-green/25 text-om-green hover:underline"
                    : isPending
                      ? "border-om-blue/25 text-om-blue"
                      : "border-om-red/25 text-om-red"
                }`}
              >
                {p && <p.Icon className="size-3" style={{ color: p.color }} />}
                {p?.name ?? pid} · {ok ? "live" : isPending ? "uploading" : r.error || "failed"}
                {r.simulated && ok ? " (sim)" : ""}
              </a>
            );
          })}
        </div>

        <div className="mt-2 flex items-center gap-2">
          {pending > 0 && (
            <OmButton variant="outline" size="sm" onClick={() => refresh.mutate()} disabled={refresh.isPending}>
              <RefreshCw className={refresh.isPending ? "animate-spin" : ""} /> Check status
            </OmButton>
          )}
          {status === "failed" && (
            <OmButton variant="solid" size="sm" onClick={() => publish.mutate()} disabled={publish.isPending}>
              {publish.isPending ? <Loader2 className="animate-spin" /> : <RotateCcw />} Retry
            </OmButton>
          )}
          <OmButton asChild variant="ghost" size="sm" className="ml-auto">
            <Link href="/dashboard/published">All published</Link>
          </OmButton>
          <OmButton variant="ghost" size="sm" onClick={reset}>
            <RotateCcw /> New post
          </OmButton>
        </div>
      </div>
    );
  }

  // ---- scheduled ----------------------------------------------------
  if (status === "scheduled" && post?.scheduled_at) {
    const providerRun = post.provider_jobs?.mode === "scheduled";
    return (
      <>
        {scheduler}
        <div className="rounded-xl border border-om-blue/30 bg-om-blue/[0.06] p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Clock className="size-4 text-om-blue" />
            <span className="text-[12px] font-semibold text-om-blue">
              Scheduled · {shortDateTime(post.scheduled_at)}
            </span>
            <span className="text-[10px] text-om-muted">({relativeTime(post.scheduled_at)})</span>
            <span className="ml-auto flex gap-1.5">
              <OmButton variant="outline" size="sm" onClick={() => setOpen(true)}>
                <CalendarClock /> Reschedule
              </OmButton>
              <OmButton
                variant="ghost"
                size="sm"
                onClick={() => unschedule.mutate()}
                disabled={unschedule.isPending}
              >
                {unschedule.isPending ? <Loader2 className="animate-spin" /> : <XCircle />} Cancel
              </OmButton>
            </span>
          </div>
          <div className="mt-1.5 text-[10px] text-om-muted">
            {providerRun
              ? "Queued on the network — it goes out automatically at that time."
              : "Publishes on the next scheduler run at/after that time."}
          </div>
        </div>
      </>
    );
  }

  // ---- draft ------------------------------------------------------
  return (
    <>
      {scheduler}
      <div className="sticky bottom-2 z-20 flex flex-wrap items-center gap-2 rounded-xl border border-om-border-strong bg-om-bg2/95 px-3 py-2 shadow-2xl backdrop-blur">
        <span className="text-[11px] text-om-muted">
          {draft.saving ? "Saving…" : draft.postId ? "Draft saved" : "New post"}
        </span>

        {checks && !checks.ok && (
          <span className="flex items-center gap-1 text-[10.5px] text-om-red">
            <CircleAlert className="size-3" /> {checks.errors} error{checks.errors === 1 ? "" : "s"} to fix
          </span>
        )}
        {form.platforms.length === 0 && (
          <span className="text-[10.5px] text-om-amber">Pick at least one channel</span>
        )}

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <OmButton variant="outline" size="sm" disabled={!canAct} onClick={() => setOpen(true)}>
            <CalendarClock /> Schedule
          </OmButton>
          <OmButton
            variant="solid"
            size="sm"
            disabled={!canGo || publish.isPending}
            onClick={() => publish.mutate()}
          >
            {publish.isPending ? <Loader2 className="animate-spin" /> : <SendHorizontal />}
            Publish now
          </OmButton>
        </div>
      </div>
    </>
  );
}
