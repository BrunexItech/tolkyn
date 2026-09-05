"use client";

import Link from "next/link";
import { Building2, Users, Activity, TrendingUp, ArrowRight, Clapperboard } from "lucide-react";
import { SectionHeading } from "@/components/om/primitives/SectionHeading";
import { Grid } from "@/components/om/primitives/Grid";
import { StatTile } from "@/components/om/primitives/StatTile";
import { Card, CardTitle } from "@/components/om/primitives/Card";
import { useOverview } from "@/components/admin/hooks";

export default function AdminOverviewPage() {
  const { data: s } = useOverview();

  return (
    <div className="space-y-3">
      <SectionHeading
        title="Platform overview"
        subtitle="Everything running on Tolkyn, at a glance"
        icon={<TrendingUp />}
      />

      <Grid cols={4}>
        <StatTile label="Organizations" value={s?.organizations ?? "—"} icon={<Building2 />} color="var(--om-violet)" />
        <StatTile label="Subdomains" value={s?.subsidiaries ?? "—"} icon={<Building2 />} color="var(--om-blue)" />
        <StatTile label="Users" value={s?.users ?? "—"} icon={<Users />} color="var(--om-green)" />
        <StatTile label="Active (7d)" value={s?.active_users_7d ?? "—"} icon={<Activity />} color="var(--om-amber)" />
      </Grid>

      <Grid cols={3}>
        <Card>
          <CardTitle icon={<Building2 />} color="var(--om-violet)">
            Organizations &amp; subdomains
          </CardTitle>
          <p className="text-[12px] leading-relaxed text-om-dim">
            Create organizations and give each a subdomain. Only the platform control room
            can create these — tenants can never self-serve a subdomain.
          </p>
          <Link
            href="/admin/organizations"
            className="mt-3 inline-flex items-center gap-1 text-[12px] font-medium text-om-violet hover:underline"
          >
            Manage organizations <ArrowRight className="size-3.5" />
          </Link>
        </Card>

        <Card>
          <CardTitle icon={<Activity />} color="var(--om-blue)">
            Requests tracked
          </CardTitle>
          <div className="flex items-end gap-6">
            <div>
              <div className="font-mono text-[22px] font-bold text-om-text">{s?.requests_today ?? "—"}</div>
              <div className="text-[10.5px] text-om-muted">today</div>
            </div>
            <div>
              <div className="font-mono text-[22px] font-bold text-om-text">{s?.requests_7d ?? "—"}</div>
              <div className="text-[10.5px] text-om-muted">last 7 days</div>
            </div>
          </div>
          <Link
            href="/admin/activity"
            className="mt-3 inline-flex items-center gap-1 text-[12px] font-medium text-om-blue hover:underline"
          >
            View activity log <ArrowRight className="size-3.5" />
          </Link>
        </Card>

        <Card>
          <CardTitle icon={<Clapperboard />} color="var(--om-violet)">
            AI video generation
          </CardTitle>
          <div className="flex items-end gap-6">
            <div>
              <div className="font-mono text-[22px] font-bold text-om-text">{s?.video_jobs_total ?? "—"}</div>
              <div className="text-[10.5px] text-om-muted">videos generated</div>
            </div>
            <div>
              <div className="font-mono text-[22px] font-bold text-om-text">
                ${s?.video_spend_usd_total?.toFixed(2) ?? "0.00"}
              </div>
              <div className="text-[10.5px] text-om-muted">total spend</div>
            </div>
          </div>
          <Link
            href="/admin/video"
            className="mt-3 inline-flex items-center gap-1 text-[12px] font-medium text-om-violet hover:underline"
          >
            Manage model access &amp; spend <ArrowRight className="size-3.5" />
          </Link>
        </Card>
      </Grid>
    </div>
  );
}
