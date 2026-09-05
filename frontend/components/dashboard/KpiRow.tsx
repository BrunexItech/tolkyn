"use client";

import { Eye, Heart, Send, UserPlus } from "lucide-react";
import { Grid } from "@/components/om/primitives/Grid";
import { StatTile } from "@/components/om/primitives/StatTile";
import { Pill } from "@/components/om/primitives/Pill";
import { compact } from "@/lib/om/format";
import { useOverview } from "./hooks";

export function KpiRow() {
  const { data: ov, isLoading } = useOverview(30);
  const v = (n?: number) => (isLoading || n == null ? "—" : n);

  return (
    <div className="mb-3">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-om-faint">
          Last 30 days
        </span>
        {ov && (
          <Pill tone={ov.provider === "live" ? "green" : "muted"} dot={ov.provider === "live"}>
            {ov.provider === "live" ? "Live data" : "Modelled — connect an account"}
          </Pill>
        )}
      </div>
      <Grid cols={4}>
        <StatTile
          label="Reach"
          value={ov ? compact(ov.reach) : "—"}
          icon={<Eye />}
          color="var(--om-blue)"
          delta={ov?.reach_delta}
          loading={isLoading}
        />
        <StatTile
          label="Engagement rate"
          value={ov ? `${ov.engagement_rate}%` : "—"}
          icon={<Heart />}
          color="var(--om-pink)"
          delta={ov?.engagement_delta}
          loading={isLoading}
        />
        <StatTile
          label="Posts published"
          value={v(ov?.posts_published)}
          icon={<Send />}
          color="var(--om-green)"
          loading={isLoading}
        />
        <StatTile
          label="New followers"
          value={ov ? compact(ov.new_followers) : "—"}
          icon={<UserPlus />}
          color="var(--om-violet)"
          delta={ov?.followers_delta}
          loading={isLoading}
        />
      </Grid>
    </div>
  );
}
