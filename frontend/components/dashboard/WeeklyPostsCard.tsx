"use client";

import { BarChart3 } from "lucide-react";
import { format, subDays, isSameDay } from "date-fns";
import { Card, CardTitle } from "@/components/om/primitives/Card";
import { EmptyState } from "@/components/om/primitives/EmptyState";
import { BarBreakdown } from "@/components/om/charts";
import { platform as findPlatform } from "@/lib/om/platforms";
import { useAllPosts } from "./hooks";

const PLATS = ["instagram", "tiktok", "facebook", "x", "linkedin", "youtube"] as const;

export function WeeklyPostsCard() {
  const { data } = useAllPosts();
  const posts = (data?.items ?? []).filter(
    (p) =>
      (p.status === "published" || p.status === "partial") && p.published_at,
  );

  const today = new Date();
  const days = Array.from({ length: 7 }, (_, i) => subDays(today, 6 - i));

  const rows = days.map((d) => {
    const row: Record<string, string | number> = { name: format(d, "EEE") };
    for (const plat of PLATS) row[findPlatform(plat)?.name ?? plat] = 0;
    for (const p of posts) {
      if (!isSameDay(new Date(p.published_at as string), d)) continue;
      for (const plat of p.platforms) {
        const name = findPlatform(plat)?.name ?? plat;
        if (name in row) row[name] = (row[name] as number) + 1;
      }
    }
    return row;
  });

  const total = rows.reduce(
    (n, r) =>
      n +
      PLATS.reduce((s, plat) => s + ((r[findPlatform(plat)?.name ?? plat] as number) || 0), 0),
    0,
  );

  const series = PLATS.map((plat) => ({
    key: findPlatform(plat)?.name ?? plat,
    color: findPlatform(plat)?.color ?? "#888",
    stackId: "a",
  }));

  return (
    <Card>
      <CardTitle icon={<BarChart3 />}>Posts published this week</CardTitle>
      {total > 0 ? (
        <BarBreakdown data={rows} series={series} height={168} />
      ) : (
        <EmptyState title="Nothing published in the last 7 days" />
      )}
    </Card>
  );
}
