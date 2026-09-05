"use client";

import {
  ExternalLink,
  RefreshCw,
  RotateCcw,
  Trash2,
  CircleCheck,
  CircleX,
  Clock,
  Loader2,
  ImageIcon,
} from "lucide-react";
import { OmButton } from "@/components/om/primitives/OmButton";
import { StatusBadge, type BadgeTone } from "@/components/om/primitives/StatusBadge";
import { platform as findPlatform } from "@/lib/om/platforms";
import { relativeTime, shortDateTime } from "@/lib/om/format";
import { cn } from "@/lib/utils";
import { useRefreshPost, useRetryPost, useDeleteActivityPost } from "./hooks";
import type { Post } from "@/lib/api/posts";

const STATUS: Record<string, { tone: BadgeTone; label: string }> = {
  publishing: { tone: "blue", label: "Publishing" },
  published: { tone: "green", label: "Live" },
  partial: { tone: "amber", label: "Partly live" },
  failed: { tone: "red", label: "Failed" },
  scheduled: { tone: "blue", label: "Scheduled" },
};

function PlatformResult({
  pid,
  r,
}: {
  pid: string;
  r: { status?: string; url?: string; error?: string; simulated?: boolean };
}) {
  const p = findPlatform(pid);
  const st = r.status;
  return (
    <div className="flex items-start gap-2 py-1 text-[11.5px]">
      <span
        className="mt-0.5 grid size-4 shrink-0 place-items-center"
        style={{ color: p?.color }}
      >
        {p?.Icon ? <p.Icon className="size-3.5" /> : null}
      </span>
      <span className="w-16 shrink-0 text-om-muted">{p?.name ?? pid}</span>
      {st === "published" || st === "scheduled" ? (
        r.url ? (
          <a
            href={r.url}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 font-medium text-om-green hover:underline"
          >
            <CircleCheck className="size-3.5" />
            {st === "scheduled" ? "Scheduled" : "View live"}
            <ExternalLink className="size-3" />
          </a>
        ) : (
          <span className="flex items-center gap-1 text-om-green">
            <CircleCheck className="size-3.5" />
            {st === "scheduled" ? "Scheduled" : "Posted"}
            {r.simulated && <span className="text-om-faint">(test mode)</span>}
          </span>
        )
      ) : st === "publishing" ? (
        <span className="flex items-center gap-1 text-om-blue">
          <Loader2 className="size-3.5 animate-spin" /> Publishing…
        </span>
      ) : (
        <span className="flex items-start gap-1 text-om-red">
          <CircleX className="mt-px size-3.5 shrink-0" />
          <span>{r.error || "Failed"}</span>
        </span>
      )}
    </div>
  );
}

export function PostActivityCard({ post }: { post: Post }) {
  const refresh = useRefreshPost();
  const retry = useRetryPost();
  const del = useDeleteActivityPost();

  const s = STATUS[post.status] ?? { tone: "muted" as BadgeTone, label: post.status };
  const entries = Object.entries(post.per_platform || {});
  const anyFailed = entries.some(([, r]) => r?.status === "failed");
  const anyPending =
    post.status === "publishing" || entries.some(([, r]) => r?.status === "publishing");
  const thumb = post.media.find((m) => m.type === "image")?.url;
  const when = post.published_at || post.scheduled_at || post.updated_at;

  return (
    <div
      className={cn(
        "rounded-xl border bg-om-card p-3.5",
        post.status === "failed"
          ? "border-om-red/25"
          : post.status === "partial"
            ? "border-om-amber/25"
            : "border-om-border",
      )}
    >
      <div className="flex gap-3">
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumb}
            alt=""
            className="size-14 shrink-0 rounded-lg border border-om-border object-cover"
          />
        ) : post.media.length > 0 ? (
          <div className="grid size-14 shrink-0 place-items-center rounded-lg border border-om-border bg-white/[0.03] text-om-muted">
            <ImageIcon className="size-4" />
          </div>
        ) : null}

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tone={s.tone}>{s.label}</StatusBadge>
            <span className="flex items-center gap-1 text-[10.5px] text-om-muted">
              <Clock className="size-3" />
              {post.status === "scheduled" && post.scheduled_at
                ? `for ${shortDateTime(post.scheduled_at)}`
                : when
                  ? relativeTime(when)
                  : ""}
            </span>
          </div>
          <p className="mt-1.5 line-clamp-2 whitespace-pre-wrap text-[12px] leading-relaxed text-om-dim">
            {post.body || post.title || "(no text)"}
          </p>
        </div>
      </div>

      {entries.length > 0 && (
        <div className="mt-2 divide-y divide-white/[0.04] border-t border-white/[0.04] pt-1">
          {entries.map(([pid, r]) => (
            <PlatformResult key={pid} pid={pid} r={r || {}} />
          ))}
        </div>
      )}

      <div className="mt-2.5 flex items-center gap-1.5">
        {(anyPending || post.provider_jobs?.job_id) && (
          <OmButton
            variant="subtle"
            size="xs"
            onClick={() => refresh.mutate(post.id)}
            disabled={refresh.isPending}
          >
            {refresh.isPending ? (
              <Loader2 className="animate-spin" />
            ) : (
              <RefreshCw />
            )}
            Check status
          </OmButton>
        )}
        {(post.status === "failed" || post.status === "partial") && (
          <OmButton
            variant="solid"
            size="xs"
            onClick={() => retry.mutate(post.id)}
            disabled={retry.isPending}
          >
            {retry.isPending ? <Loader2 className="animate-spin" /> : <RotateCcw />}
            {anyFailed ? "Retry failed" : "Retry"}
          </OmButton>
        )}
        <button
          onClick={() => del.mutate(post.id)}
          title="Remove from list"
          className="ml-auto grid size-6 place-items-center rounded-md text-om-muted hover:bg-om-red/10 hover:text-om-red"
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>
    </div>
  );
}
