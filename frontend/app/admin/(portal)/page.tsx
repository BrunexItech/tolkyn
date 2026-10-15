"use client";

import { useState } from "react";
import Link from "next/link";
import { Building2, Users, Activity, TrendingUp, ArrowRight, Clapperboard, Sparkles, FileDown, Loader2 } from "lucide-react";
import { SectionHeading } from "@/components/om/primitives/SectionHeading";
import { Grid } from "@/components/om/primitives/Grid";
import { StatTile } from "@/components/om/primitives/StatTile";
import { Card, CardTitle } from "@/components/om/primitives/Card";
import { OmButton } from "@/components/om/primitives/OmButton";
import { useOverview } from "@/components/admin/hooks";
import { adminApi } from "@/lib/api/admin";
import { toast } from "@/lib/om/toast";

function toDateInput(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function PlatformReportCard() {
  const today = new Date();
  const monthAgo = new Date(today);
  monthAgo.setDate(monthAgo.getDate() - 30);

  const [start, setStart] = useState(toDateInput(monthAgo));
  const [end, setEnd] = useState(toDateInput(today));
  const [downloading, setDownloading] = useState(false);

  const download = async () => {
    if (!start || !end || start > end) {
      toast.err("Pick a valid date range");
      return;
    }
    setDownloading(true);
    try {
      await adminApi.downloadReport(start, end);
      toast.ok("Report downloaded");
    } catch (e) {
      toast.err(e instanceof Error ? e.message : "Couldn't generate the report");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Card>
      <CardTitle icon={<FileDown />} color="var(--om-blue)">
        Platform report
      </CardTitle>
      <p className="mb-2.5 text-[12px] leading-relaxed text-om-dim">
        A styled PDF covering content/social posts and messaging (SMS, WhatsApp, Email) across every workspace, for
        a date range you pick.
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-om-faint">From</span>
          <input
            type="date"
            value={start}
            max={end}
            onChange={(e) => setStart(e.target.value)}
            className="rounded-lg border border-om-border bg-white/[0.03] px-2.5 py-1.5 text-[12px] text-om-text outline-none focus:border-om-blue/60"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-om-faint">To</span>
          <input
            type="date"
            value={end}
            min={start}
            max={toDateInput(today)}
            onChange={(e) => setEnd(e.target.value)}
            className="rounded-lg border border-om-border bg-white/[0.03] px-2.5 py-1.5 text-[12px] text-om-text outline-none focus:border-om-blue/60"
          />
        </label>
        <OmButton variant="solid" size="sm" onClick={download} disabled={downloading}>
          {downloading ? <Loader2 className="animate-spin" /> : <FileDown />}
          {downloading ? "Generating…" : "Download PDF"}
        </OmButton>
      </div>
    </Card>
  );
}

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

      <PlatformReportCard />

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

        <Card>
          <CardTitle icon={<Sparkles />} color="var(--om-green)">
            AI image generation
          </CardTitle>
          <div className="flex items-end gap-6">
            <div>
              <div className="font-mono text-[22px] font-bold text-om-text">{s?.image_jobs_total ?? "—"}</div>
              <div className="text-[10.5px] text-om-muted">images generated</div>
            </div>
            <div>
              <div className="font-mono text-[22px] font-bold text-om-text">
                ${s?.image_spend_usd_total?.toFixed(2) ?? "0.00"}
              </div>
              <div className="text-[10.5px] text-om-muted">est. spend</div>
            </div>
          </div>
          <Link
            href="/admin/images"
            className="mt-3 inline-flex items-center gap-1 text-[12px] font-medium text-om-green hover:underline"
          >
            View spend by user <ArrowRight className="size-3.5" />
          </Link>
        </Card>
      </Grid>
    </div>
  );
}
