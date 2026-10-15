"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChartNoAxesColumn, Eye, Heart, UserPlus, Send, Clock, FileDown, Mail, Loader2 } from "lucide-react";
import { SectionHeading } from "@/components/om/primitives/SectionHeading";
import { Grid } from "@/components/om/primitives/Grid";
import { StatTile } from "@/components/om/primitives/StatTile";
import { Card, CardTitle } from "@/components/om/primitives/Card";
import { TableWrap } from "@/components/om/primitives/Table";
import { EmptyState } from "@/components/om/primitives/EmptyState";
import { Skeleton, SkeletonText } from "@/components/om/primitives/Skeleton";
import { Pill } from "@/components/om/primitives/Pill";
import { Delta } from "@/components/om/primitives/Delta";
import { OmButton } from "@/components/om/primitives/OmButton";
import { AreaTrend } from "@/components/om/charts";
import { analyticsApi } from "@/lib/api/analytics";
import { platform as findPlatform } from "@/lib/om/platforms";
import { compact } from "@/lib/om/format";
import { toast } from "@/lib/om/toast";

function toDateInput(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function ReportDownloadCard() {
  const today = new Date();
  const monthAgo = new Date(today);
  monthAgo.setDate(monthAgo.getDate() - 30);

  const [start, setStart] = useState(toDateInput(monthAgo));
  const [end, setEnd] = useState(toDateInput(today));
  const [downloading, setDownloading] = useState(false);
  const [emailing, setEmailing] = useState(false);

  const validRange = () => {
    if (!start || !end || start > end) {
      toast.err("Pick a valid date range");
      return false;
    }
    return true;
  };

  const download = async () => {
    if (!validRange()) return;
    setDownloading(true);
    try {
      await analyticsApi.downloadReport(start, end);
      toast.ok("Report downloaded");
    } catch (e) {
      toast.err(e instanceof Error ? e.message : "Couldn't generate the report");
    } finally {
      setDownloading(false);
    }
  };

  const emailIt = async () => {
    if (!validRange()) return;
    setEmailing(true);
    try {
      const res = await analyticsApi.emailReport(start, end);
      toast.ok(`Report emailed to ${res.to_email}`);
    } catch (e) {
      toast.err(e instanceof Error ? e.message : "Couldn't email the report");
    } finally {
      setEmailing(false);
    }
  };

  return (
    <Card>
      <CardTitle icon={<FileDown />}>Performance report</CardTitle>
      <p className="mb-2.5 text-[11.5px] text-om-muted">
        A styled PDF covering content/social posts, messaging (SMS, WhatsApp, Email) and reach &amp; engagement
        for a date range you pick — with AI-written takeaways and recommendations grounded in your real numbers.
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
        <OmButton variant="solid" size="sm" onClick={download} disabled={downloading || emailing}>
          {downloading ? <Loader2 className="animate-spin" /> : <FileDown />}
          {downloading ? "Generating…" : "Download PDF"}
        </OmButton>
        <OmButton variant="subtle" size="sm" onClick={emailIt} disabled={downloading || emailing}>
          {emailing ? <Loader2 className="animate-spin" /> : <Mail />}
          {emailing ? "Sending…" : "Email it to me"}
        </OmButton>
      </div>
    </Card>
  );
}

export default function AnalyticsPage() {
  const [days, setDays] = useState(30);
  const { data: ov } = useQuery({ queryKey: ["analytics", "overview", days], queryFn: () => analyticsApi.overview(days) });
  const { data: ts, isPending: tsLoading } = useQuery({ queryKey: ["analytics", "ts", days], queryFn: () => analyticsApi.timeseries(days) });
  const { data: plats, isPending: platsLoading } = useQuery({ queryKey: ["analytics", "plat", days], queryFn: () => analyticsApi.byPlatform(days) });
  const { data: top, isPending: topLoading } = useQuery({ queryKey: ["analytics", "top"], queryFn: () => analyticsApi.topPosts(10) });

  return (
    <div className="om-anim-rise space-y-3">
      <SectionHeading
        title="Analytics"
        subtitle="Reach, engagement and follower growth across your connected accounts"
        icon={<ChartNoAxesColumn />}
        actions={
          <div className="flex items-center gap-2">
            {ov && (
              <Pill tone={ov.provider === "live" ? "green" : "muted"}>
                {ov.provider === "live" ? "Live data" : "Modelled"}
              </Pill>
            )}
            <select
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className="rounded-lg border border-om-border bg-white/[0.03] px-2 py-1.5 text-[11.5px] text-om-dim outline-none"
            >
              <option value={7}>7 days</option>
              <option value={30}>30 days</option>
              <option value={90}>90 days</option>
            </select>
          </div>
        }
      />

      <Grid cols={4}>
        <StatTile label="Reach" value={ov ? compact(ov.reach) : "—"} icon={<Eye />} color="var(--om-blue)" delta={ov?.reach_delta} loading={!ov} />
        <StatTile label="Engagement rate" value={ov ? `${ov.engagement_rate}%` : "—"} icon={<Heart />} color="var(--om-pink)" delta={ov?.engagement_delta} loading={!ov} />
        <StatTile label="Followers" value={ov ? compact(ov.followers) : "—"} icon={<UserPlus />} color="var(--om-violet)" delta={ov?.followers_delta} loading={!ov} />
        <StatTile label="Posts published" value={ov?.posts_published ?? "—"} icon={<Send />} color="var(--om-green)" loading={!ov} />
      </Grid>

      <ReportDownloadCard />

      <Card>
        <CardTitle icon={<ChartNoAxesColumn />}>Reach &amp; engagement</CardTitle>
        {tsLoading ? (
          <Skeleton className="h-[190px] w-full" />
        ) : ts && ts.points.length > 0 ? (
          <AreaTrend
            data={ts.points.map((p) => ({ name: p.label, Reach: p.reach, Engaged: p.engaged }))}
            series={[
              { key: "Reach", color: "#4f7aff" },
              { key: "Engaged", color: "#22d3ee" },
            ]}
            yTickFormatter={(v) => compact(v)}
            height={190}
          />
        ) : (
          <EmptyState title="No data yet" />
        )}
      </Card>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card>
          <CardTitle>By platform</CardTitle>
          {platsLoading ? (
            <SkeletonText lines={5} className="py-2" />
          ) : !plats || plats.items.length === 0 ? (
            <EmptyState title="Connect an account to see platform stats" />
          ) : (
            <TableWrap>
              <table>
                <thead>
                  <tr>
                    <th>Platform</th>
                    <th>Followers</th>
                    <th>Reach</th>
                    <th>Eng.</th>
                    <th>Posts</th>
                    <th>Best time</th>
                  </tr>
                </thead>
                <tbody>
                  {plats.items.map((r) => {
                    const p = findPlatform(r.platform);
                    return (
                      <tr key={r.platform}>
                        <td>
                          <span className="flex items-center gap-1.5 font-medium">
                            {p && <p.Icon className="size-3.5" style={{ color: p.color }} />}
                            {p?.name ?? r.platform}
                          </span>
                        </td>
                        <td className="font-mono">
                          {compact(r.followers)} <Delta value={r.followers_delta} />
                        </td>
                        <td className="font-mono text-om-dim">{compact(r.reach)}</td>
                        <td className="text-om-green">{r.engagement_rate}%</td>
                        <td className="text-om-muted">{r.posts}</td>
                        <td className="font-mono text-[10.5px] text-om-muted">
                          <Clock className="mr-1 inline size-3" />
                          {r.best_time}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </TableWrap>
          )}
        </Card>

        <Card>
          <CardTitle>Top posts</CardTitle>
          {topLoading ? (
            <SkeletonText lines={5} className="py-2" />
          ) : !top || top.items.length === 0 ? (
            <EmptyState title="Publish something to see top posts">
              Your best-performing posts will rank here.
            </EmptyState>
          ) : (
            <div className="flex flex-col">
              {top.items.map((p) => {
                const pl = findPlatform(p.platform);
                return (
                  <div key={p.id} className="flex items-center gap-3 border-b border-white/[0.04] py-2 last:border-0">
                    {pl && (
                      <span className="grid size-6 shrink-0 place-items-center rounded-md" style={{ background: `${pl.color}24` }}>
                        <pl.Icon className="size-3" style={{ color: pl.color }} />
                      </span>
                    )}
                    <span className="flex-1 truncate text-[11.5px]">{p.text}</span>
                    <span className="shrink-0 font-mono text-[10.5px] text-om-muted">{compact(p.reach)} reach</span>
                    <Delta value={p.engagement_rate} />
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
