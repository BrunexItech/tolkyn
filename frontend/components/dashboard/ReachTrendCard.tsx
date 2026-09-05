"use client";

import { TrendingUp } from "lucide-react";
import { Card, CardTitle } from "@/components/om/primitives/Card";
import { EmptyState } from "@/components/om/primitives/EmptyState";
import { Skeleton } from "@/components/om/primitives/Skeleton";
import { AreaTrend } from "@/components/om/charts";
import { compact } from "@/lib/om/format";
import { useTimeseries } from "./hooks";

export function ReachTrendCard() {
  const { data, isLoading } = useTimeseries(14);
  const points = data?.points ?? [];
  const hasData = points.some((p) => p.reach > 0 || p.engaged > 0);

  return (
    <Card>
      <CardTitle icon={<TrendingUp />}>Reach &amp; engagement · 14 days</CardTitle>
      {isLoading ? (
        <Skeleton className="h-[168px] w-full" />
      ) : hasData ? (
        <AreaTrend
          data={points.map((p) => ({ name: p.label, Reach: p.reach, Engaged: p.engaged }))}
          series={[
            { key: "Reach", color: "#4f7aff" },
            { key: "Engaged", color: "#22d3ee" },
          ]}
          yTickFormatter={(v) => compact(v)}
          height={168}
        />
      ) : (
        <EmptyState title="No reach data yet">
          Publish through Tolkyn and connect your accounts to see the trend.
        </EmptyState>
      )}
    </Card>
  );
}
