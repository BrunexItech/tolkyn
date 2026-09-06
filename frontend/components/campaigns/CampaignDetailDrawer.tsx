"use client";

import { useState } from "react";
import { Target, Trash2, Link2, Eye, Heart, MousePointerClick, Users, Plus, Check, MapPin } from "lucide-react";
import { Drawer } from "@/components/om/primitives/Drawer";
import { LoadingState } from "@/components/om/primitives/Spinner";
import { OmButton } from "@/components/om/primitives/OmButton";
import { StatusBadge, type BadgeTone } from "@/components/om/primitives/StatusBadge";
import { EmptyState } from "@/components/om/primitives/EmptyState";
import { useQuery } from "@tanstack/react-query";
import { postsApi } from "@/lib/api/posts";
import { platform as findPlatform } from "@/lib/om/platforms";
import { compact } from "@/lib/om/format";
import { cn } from "@/lib/utils";
import { useCampaign, useUpdateCampaign, useDeleteCampaign, useAttachPost } from "./hooks";
import type { CampaignStatus } from "@/lib/api/campaigns";

const STATUS_TONE: Record<CampaignStatus, BadgeTone> = {
  draft: "muted",
  active: "green",
  paused: "amber",
  completed: "blue",
};

export function CampaignDetailDrawer({
  campaignId,
  onOpenChange,
}: {
  campaignId: string | null;
  onOpenChange: (v: boolean) => void;
}) {
  const { data: c } = useCampaign(campaignId);
  const update = useUpdateCampaign();
  const del = useDeleteCampaign();
  const attach = useAttachPost();
  const [showPicker, setShowPicker] = useState(false);
  const { data: allPosts } = useQuery({
    queryKey: ["posts", "list", "all"],
    queryFn: () => postsApi.list(),
    enabled: showPicker,
  });

  const linkedIds = new Set(c?.posts.map((p) => p.id) ?? []);

  return (
    <Drawer
      open={!!campaignId}
      onOpenChange={onOpenChange}
      width={480}
      title={c?.name ?? "Campaign"}
      subtitle={c ? `${c.objective} · ${c.channels.join(", ") || "no channels"}` : ""}
      footer={
        c ? (
          <>
            <select
              value={c.status}
              onChange={(e) => update.mutate({ id: c.id, status: e.target.value as CampaignStatus })}
              className="rounded-lg border border-om-border bg-white/[0.03] px-2 py-1.5 text-[11.5px] text-om-dim outline-none"
            >
              {(["draft", "active", "paused", "completed"] as CampaignStatus[]).map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
            <OmButton
              variant="ghost"
              size="sm"
              className="ml-auto"
              onClick={() => del.mutate(c.id, { onSuccess: () => onOpenChange(false) })}
            >
              <Trash2 /> Delete
            </OmButton>
          </>
        ) : null
      }
    >
      {!c ? (
        <LoadingState />
      ) : (
        <>
          <div className="flex items-center gap-2">
            <StatusBadge tone={STATUS_TONE[c.status]}>{c.status}</StatusBadge>
            {c.goal_target && (
              <span className="text-[11px] text-om-muted">
                Goal: {compact(c.goal_target)} {c.goal_metric}
              </span>
            )}
          </div>

          {c.metrics.goal_progress != null && (
            <div>
              <div className="mb-1 flex items-center justify-between text-[10.5px] text-om-muted">
                <span>Progress</span>
                <span className="font-mono text-om-dim">{c.metrics.goal_progress}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-om-blue to-om-cyan"
                  style={{ width: `${Math.min(c.metrics.goal_progress, 100)}%` }}
                />
              </div>
            </div>
          )}

          {c.target_area_labels.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="flex items-center gap-1 text-[10px] text-om-faint">
                <MapPin className="size-3" /> Targeting:
              </span>
              {c.target_area_labels.map((label) => (
                <span key={label} className="rounded-md border border-om-blue/25 bg-om-blue/10 px-1.5 py-0.5 text-[10px] font-medium text-om-blue">
                  {label}
                </span>
              ))}
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <Metric icon={<Eye />} label="Post reach" value={compact(c.metrics.reach)} />
            <Metric icon={<Heart />} label="Engagement" value={`${c.metrics.engagement_rate}%`} />
            <Metric icon={<MousePointerClick />} label="Clicks" value={compact(c.metrics.clicks)} />
            <Metric icon={<Users />} label="Leads" value={String(c.metrics.leads)} />
            {c.metrics.geo_estimated_reach != null && (
              <Metric icon={<MapPin />} label="Est. audience in area" value={compact(c.metrics.geo_estimated_reach)} />
            )}
          </div>

          {c.budget != null && (
            <div className="rounded-lg border border-om-border bg-white/[0.02] p-2.5 text-[11px]">
              <span className="text-om-muted">Budget </span>
              <span className="font-mono text-om-dim">
                ${compact(c.metrics.budget_spent)} / ${compact(c.budget)}
              </span>
            </div>
          )}

          {c.brief && (
            <div>
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-om-faint">Brief</div>
              <p className="text-[11.5px] leading-relaxed text-om-dim">{c.brief}</p>
            </div>
          )}

          <div>
            <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-om-faint">
              Posts ({c.posts.length})
              <button onClick={() => setShowPicker((s) => !s)} className="ml-auto text-om-blue">
                <Plus className="size-3.5" />
              </button>
            </div>
            {c.posts.length === 0 && !showPicker && (
              <EmptyState title="No posts linked yet" />
            )}
            <div className="space-y-1">
              {c.posts.map((p) => (
                <div key={p.id} className="flex items-center gap-2 rounded-md border border-om-border bg-white/[0.02] px-2 py-1.5 text-[11px]">
                  <span className="flex-1 truncate text-om-dim">{p.body || "Untitled"}</span>
                  <span className="text-[9px] text-om-muted">{p.status}</span>
                  <button
                    onClick={() => attach.mutate({ id: c.id, post_id: p.id, attach: false })}
                    className="text-om-muted hover:text-om-red"
                  >
                    <Link2 className="size-3" />
                  </button>
                </div>
              ))}
            </div>

            {showPicker && (
              <div className="mt-2 max-h-52 space-y-1 overflow-y-auto rounded-lg border border-om-border p-1.5">
                {(allPosts?.items ?? [])
                  .filter((p) => !linkedIds.has(p.id))
                  .map((p) => (
                    <button
                      key={p.id}
                      onClick={() => attach.mutate({ id: c.id, post_id: p.id, attach: true })}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[11px] hover:bg-white/[0.04]"
                    >
                      <span className="flex -space-x-1">
                        {p.platforms.map((pid) => {
                          const pl = findPlatform(pid);
                          return pl ? <pl.Icon key={pid} className="size-2.5" style={{ color: pl.color }} /> : null;
                        })}
                      </span>
                      <span className="flex-1 truncate text-om-dim">{p.body || "Untitled"}</span>
                      <span className="text-[9px] text-om-muted">{p.status}</span>
                    </button>
                  ))}
              </div>
            )}
          </div>
        </>
      )}
    </Drawer>
  );
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-om-border bg-white/[0.02] p-2.5">
      <div className="mb-0.5 flex items-center gap-1 text-[9.5px] font-semibold uppercase tracking-wide text-om-faint [&_svg]:size-3">
        {icon}
        {label}
      </div>
      <div className="font-mono text-[15px] font-bold text-om-text">{value}</div>
    </div>
  );
}
