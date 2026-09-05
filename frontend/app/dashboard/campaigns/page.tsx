"use client";

import { useState } from "react";
import { Megaphone, Plus, Eye, Rocket, CheckCircle2, FileText } from "lucide-react";
import { SectionHeading } from "@/components/om/primitives/SectionHeading";
import { Grid } from "@/components/om/primitives/Grid";
import { StatTile } from "@/components/om/primitives/StatTile";
import { Card } from "@/components/om/primitives/Card";
import { EmptyState } from "@/components/om/primitives/EmptyState";
import { OmButton } from "@/components/om/primitives/OmButton";
import { StatusBadge, type BadgeTone } from "@/components/om/primitives/StatusBadge";
import { CampaignDialog } from "@/components/campaigns/CampaignDialog";
import { CampaignDetailDrawer } from "@/components/campaigns/CampaignDetailDrawer";
import { useCampaigns, useCampaignSummary } from "@/components/campaigns/hooks";
import { platform as findPlatform } from "@/lib/om/platforms";
import { compact } from "@/lib/om/format";
import type { CampaignStatus } from "@/lib/api/campaigns";

const TONE: Record<CampaignStatus, BadgeTone> = {
  draft: "muted",
  active: "green",
  paused: "amber",
  completed: "blue",
};

export default function CampaignsPage() {
  const { data } = useCampaigns();
  const { data: summary } = useCampaignSummary();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const campaigns = data?.items ?? [];

  return (
    <div className="om-anim-rise space-y-3">
      <SectionHeading
        title="Campaigns"
        subtitle="Plan multi-channel pushes, link posts, and track results against a goal"
        icon={<Megaphone />}
        actions={
          <OmButton variant="solid" size="sm" onClick={() => setDialogOpen(true)}>
            <Plus /> New campaign
          </OmButton>
        }
      />

      <Grid cols={4}>
        <StatTile label="Active" value={summary?.active ?? "—"} icon={<Rocket />} color="var(--om-green)" />
        <StatTile label="Drafts" value={summary?.draft ?? "—"} icon={<FileText />} color="var(--om-amber)" />
        <StatTile label="Completed" value={summary?.completed ?? "—"} icon={<CheckCircle2 />} color="var(--om-blue)" />
        <StatTile label="Active reach" value={summary ? compact(summary.active_reach) : "—"} icon={<Eye />} color="var(--om-violet)" />
      </Grid>

      {campaigns.length === 0 ? (
        <Card>
          <EmptyState icon={<Megaphone />} title="No campaigns yet">
            Create one to group posts under a goal.
          </EmptyState>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {campaigns.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelected(c.id)}
              className="om-edge rounded-xl border border-om-border bg-om-card p-3.5 text-left transition-colors hover:border-om-border-strong"
            >
              <div className="mb-1.5 flex items-center gap-2">
                <StatusBadge tone={TONE[c.status]}>{c.status}</StatusBadge>
                <span className="text-[10px] capitalize text-om-muted">{c.objective}</span>
              </div>
              <div className="text-[13px] font-semibold tracking-tight">{c.name}</div>
              {c.brief && <p className="mt-1 line-clamp-2 text-[11px] text-om-muted">{c.brief}</p>}
              <div className="mt-2.5 flex items-center gap-1">
                {c.channels.map((pid) => {
                  const p = findPlatform(pid);
                  return p ? (
                    <span key={pid} className="grid size-5 place-items-center rounded" style={{ background: `${p.color}22` }}>
                      <p.Icon className="size-2.5" style={{ color: p.color }} />
                    </span>
                  ) : null;
                })}
                {c.goal_target && (
                  <span className="ml-auto font-mono text-[10px] text-om-faint">
                    goal {compact(c.goal_target)} {c.goal_metric}
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      <CampaignDialog open={dialogOpen} onOpenChange={setDialogOpen} />
      <CampaignDetailDrawer campaignId={selected} onOpenChange={(v) => !v && setSelected(null)} />
    </div>
  );
}
