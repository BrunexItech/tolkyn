"use client";

import { PieChart } from "lucide-react";
import { Card, CardTitle } from "@/components/om/primitives/Card";
import { EmptyState } from "@/components/om/primitives/EmptyState";
import { Skeleton } from "@/components/om/primitives/Skeleton";
import { DonutSplit } from "@/components/om/charts";
import { platform as findPlatform } from "@/lib/om/platforms";
import { useByPlatform } from "./hooks";

export function ChannelMixCard() {
  const { data, isLoading } = useByPlatform(30);
  const rows = (data?.items ?? []).filter((r) => r.reach > 0);

  const slices = rows.map((r) => ({
    name: findPlatform(r.platform)?.name ?? r.platform,
    value: r.reach,
    color: findPlatform(r.platform)?.color,
  }));

  return (
    <Card>
      <CardTitle icon={<PieChart />}>Reach by channel · 30 days</CardTitle>
      {isLoading ? (
        <Skeleton className="h-[168px] w-full" />
      ) : slices.length > 0 ? (
        <DonutSplit data={slices} height={168} />
      ) : (
        <EmptyState title="No channel data yet">
          Connect accounts and publish to see the split.
        </EmptyState>
      )}
    </Card>
  );
}
