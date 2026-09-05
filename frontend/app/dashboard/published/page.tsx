"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Send,
  CircleCheck,
  CircleX,
  TriangleAlert,
  Loader2,
  Plus,
  RefreshCw,
} from "lucide-react";
import { SectionHeading } from "@/components/om/primitives/SectionHeading";
import { Grid } from "@/components/om/primitives/Grid";
import { StatTile } from "@/components/om/primitives/StatTile";
import { Card } from "@/components/om/primitives/Card";
import { EmptyState } from "@/components/om/primitives/EmptyState";
import { OmButton } from "@/components/om/primitives/OmButton";
import { PostActivityCard } from "@/components/published/PostActivityCard";
import { ApprovalQueueCard } from "@/components/published/ApprovalQueueCard";
import {
  usePublishedPosts,
  usePostActivitySummary,
  useApprovalQueue,
} from "@/components/published/hooks";
import { cn } from "@/lib/utils";
import type { PostStatus } from "@/lib/api/posts";

const FILTERS: { id: PostStatus | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "published", label: "Live" },
  { id: "publishing", label: "Publishing" },
  { id: "scheduled", label: "Scheduled" },
  { id: "partial", label: "Partly failed" },
  { id: "failed", label: "Failed" },
];

export default function PublishedPage() {
  const [filter, setFilter] = useState<PostStatus | "all">("all");
  const { data, isLoading, isFetching, refetch } = usePublishedPosts();
  const { data: summary } = usePostActivitySummary();
  // 403s to an empty result for anyone without "approvals" — nothing shown,
  // no error banner (see useApprovalQueue).
  const { data: approvalQueue } = useApprovalQueue();
  const pending = approvalQueue?.items ?? [];

  const items = data?.items ?? [];
  const shown = useMemo(
    () => (filter === "all" ? items : items.filter((p) => p.status === filter)),
    [items, filter],
  );

  const count = (id: (typeof FILTERS)[number]["id"]) =>
    id === "all" ? items.length : items.filter((p) => p.status === id).length;

  return (
    <div className="om-anim-rise space-y-3">
      <SectionHeading
        title="Published"
        subtitle="Everything you've sent from the composer — live links, and anything that needs another try"
        icon={<Send />}
        actions={
          <>
            <OmButton
              variant="ghost"
              size="sm"
              onClick={() => refetch()}
              disabled={isFetching}
            >
              <RefreshCw className={isFetching ? "animate-spin" : ""} /> Refresh
            </OmButton>
            <OmButton asChild variant="outline" size="sm">
              <Link href="/dashboard/publishing">
                <Plus /> New post
              </Link>
            </OmButton>
          </>
        }
      />

      <Grid cols={4}>
        <StatTile
          label="Live"
          value={summary?.published ?? "—"}
          icon={<CircleCheck />}
          color="var(--om-green)"
        />
        <StatTile
          label="Publishing"
          value={summary?.publishing ?? "—"}
          icon={<Loader2 />}
          color="var(--om-blue)"
        />
        <StatTile
          label="Partly failed"
          value={summary?.partial ?? "—"}
          icon={<TriangleAlert />}
          color="var(--om-amber)"
        />
        <StatTile
          label="Failed"
          value={summary?.failed ?? "—"}
          icon={<CircleX />}
          color="var(--om-red)"
        />
      </Grid>

      {pending.length > 0 && (
        <div className="space-y-2">
          <SectionHeading
            title={`Needs approval (${pending.length})`}
            subtitle="Submitted by a teammate whose role requires review before it goes out"
          />
          <div className="grid gap-2 sm:grid-cols-2">
            {pending.map((p) => (
              <ApprovalQueueCard key={p.id} post={p} />
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={cn(
              "flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11.5px] font-medium transition-colors",
              filter === f.id
                ? "border-om-blue/40 bg-om-blue/12 text-om-blue"
                : "border-om-border text-om-muted hover:text-om-dim",
            )}
          >
            {f.label}
            <span className="rounded-full bg-white/[0.08] px-1.5 text-[10px] font-semibold">
              {count(f.id)}
            </span>
          </button>
        ))}
      </div>

      {isLoading ? (
        <Card noEdge>
          <EmptyState title="Loading…" />
        </Card>
      ) : shown.length === 0 ? (
        <Card noEdge>
          <EmptyState icon={<Send />} title={filter === "all" ? "Nothing published yet" : "Nothing here"}>
            {filter === "all" ? (
              <>
                Posts you publish or schedule from the{" "}
                <Link href="/dashboard/publishing" className="text-om-blue underline">
                  composer
                </Link>{" "}
                show up here with their live links.
              </>
            ) : (
              "No posts with this status."
            )}
          </EmptyState>
        </Card>
      ) : (
        <div className="grid gap-2.5 lg:grid-cols-2">
          {shown.map((p) => (
            <PostActivityCard key={p.id} post={p} />
          ))}
        </div>
      )}
    </div>
  );
}
