"use client";

import { Target, Flame, ArrowRightLeft, TrendingUp } from "lucide-react";
import { Grid } from "@/components/om/primitives/Grid";
import { StatTile } from "@/components/om/primitives/StatTile";
import { useLeadSummary } from "./hooks";

export function LeadStats() {
  const { data } = useLeadSummary();
  const s = data;

  return (
    <Grid cols={4}>
      <StatTile label="Total leads" value={s?.total_leads ?? "—"} icon={<Target />} color="var(--om-blue)" />
      <StatTile
        label="Hot / Warm / Cold"
        value={s ? `${s.hot_leads} / ${s.warm_leads} / ${s.cold_leads}` : "—"}
        icon={<Flame />}
        color="var(--om-amber)"
      />
      <StatTile
        label="Converted"
        value={s?.closed_won_leads ?? "—"}
        icon={<ArrowRightLeft />}
        color="var(--om-green)"
      />
      <StatTile
        label="Conversion rate"
        value={s ? `${s.conversion_rate}%` : "—"}
        icon={<TrendingUp />}
        color="var(--om-violet)"
      />
    </Grid>
  );
}
