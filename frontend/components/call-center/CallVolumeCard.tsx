"use client";

import { BarChart3 } from "lucide-react";
import { Card, CardTitle } from "@/components/om/primitives/Card";
import { BarBreakdown } from "@/components/om/charts";
import { EmptyState } from "@/components/om/primitives/EmptyState";
import { useCallCenter } from "./store";

export function CallVolumeCard() {
  const { volume } = useCallCenter();
  const hasData = volume.some((v) => v.Inbound || v.Outbound);

  return (
    <Card>
      <CardTitle icon={<BarChart3 />}>Call volume by hour</CardTitle>
      {hasData ? (
        <BarBreakdown
          data={volume as unknown as Record<string, string | number>[]}
          series={[
            { key: "Inbound", color: "#22d3ee", stackId: "a" },
            { key: "Outbound", color: "#8b7bf0", stackId: "a" },
          ]}
          height={168}
        />
      ) : (
        <EmptyState icon={<BarChart3 />} title="No calls logged today">
          Volume builds through the day as calls complete.
        </EmptyState>
      )}
    </Card>
  );
}
