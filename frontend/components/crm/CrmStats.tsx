"use client";

import { Users, CircleDollarSign, Activity, Clock3 } from "lucide-react";
import { Grid } from "@/components/om/primitives/Grid";
import { StatTile } from "@/components/om/primitives/StatTile";
import { useCustomerSummary } from "./hooks";
import { compact } from "@/lib/om/format";

export function CrmStats() {
  const { data: s } = useCustomerSummary();
  const loading = !s;

  return (
    <Grid cols={4}>
      <StatTile
        label="Customers"
        value={s?.total ?? "—"}
        icon={<Users />}
        color="var(--om-blue)"
        loading={loading}
      />
      <StatTile
        label="Monthly recurring"
        value={s ? `$${compact(s.total_mrr)}` : "—"}
        icon={<CircleDollarSign />}
        color="var(--om-green)"
        loading={loading}
      />
      <StatTile
        label="Active / Churned"
        value={s ? `${s.active} / ${s.churned}` : "—"}
        icon={<Activity />}
        color="var(--om-cyan)"
        loading={loading}
      />
      <StatTile
        label="Needs follow-up"
        value={s?.needs_follow_up ?? "—"}
        icon={<Clock3 />}
        color="var(--om-amber)"
        loading={loading}
      />
    </Grid>
  );
}
