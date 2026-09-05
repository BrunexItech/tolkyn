"use client";

import { PhoneCall, Timer, PhoneIncoming, PhoneMissed } from "lucide-react";
import { Grid } from "@/components/om/primitives/Grid";
import { StatTile } from "@/components/om/primitives/StatTile";
import { useCallCenter } from "./store";
import { formatDuration } from "@/lib/om/call-center";

export function CallStats() {
  const { stats, loading } = useCallCenter();
  const dash = "—";
  const busy = loading && !stats;

  return (
    <Grid cols={4}>
      <StatTile
        label="Calls today"
        value={stats ? stats.callsToday : dash}
        icon={<PhoneCall />}
        color="var(--om-blue)"
        delta={stats?.callsDelta}
        loading={busy}
      />
      <StatTile
        label="Avg handle time"
        value={stats ? formatDuration(stats.avgHandleSec) : dash}
        icon={<Timer />}
        color="var(--om-cyan)"
        delta={stats?.ahtDelta}
        deltaInvert
        loading={busy}
      />
      <StatTile
        label="Answer rate"
        value={stats ? `${stats.answerRate}%` : dash}
        icon={<PhoneIncoming />}
        color="var(--om-green)"
        delta={stats?.answerDelta}
        loading={busy}
      />
      <StatTile
        label="Missed"
        value={stats ? stats.missed : dash}
        icon={<PhoneMissed />}
        color="var(--om-red)"
        delta={stats?.missedDelta}
        deltaInvert
        loading={busy}
      />
    </Grid>
  );
}
