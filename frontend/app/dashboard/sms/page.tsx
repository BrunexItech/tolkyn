"use client";

import { MessageSquareText, Send, CheckCheck, TriangleAlert } from "lucide-react";
import { SectionHeading } from "@/components/om/primitives/SectionHeading";
import { Grid } from "@/components/om/primitives/Grid";
import { StatTile } from "@/components/om/primitives/StatTile";
import { Pill } from "@/components/om/primitives/Pill";
import { BroadcastComposer } from "@/components/messaging/BroadcastComposer";
import { BroadcastHistory } from "@/components/messaging/BroadcastHistory";
import { useMessagingSummary } from "@/components/messaging/hooks";
import { compact } from "@/lib/om/format";

const SMS_ACCENT = "#4f7aff";

export default function BulkSmsPage() {
  const { data: s } = useMessagingSummary();
  const live = s?.sms_provider && s.sms_provider !== "simulated";

  return (
    <div className="om-anim-rise space-y-3">
      <SectionHeading
        title="Bulk SMS"
        subtitle="Send SMS campaigns to your phone books, leads and customers"
        icon={<MessageSquareText />}
        actions={
          <Pill tone={live ? "green" : "amber"} dot>
            {live ? "Live" : "Test mode"}
          </Pill>
        }
      />

      <Grid cols={3}>
        <StatTile label="SMS campaigns" value={s?.sms_broadcasts ?? "—"} icon={<Send />} color={SMS_ACCENT} loading={!s} />
        <StatTile
          label="Delivered"
          value={s ? compact(s.messages_sent) : "—"}
          icon={<CheckCheck />}
          color="var(--om-green)"
          loading={!s}
        />
        <StatTile
          label="Failed"
          value={s?.messages_failed ?? "—"}
          icon={<TriangleAlert />}
          color="var(--om-red)"
          loading={!s}
        />
      </Grid>

      <div className="grid gap-3 lg:grid-cols-[1.1fr_0.9fr]">
        <BroadcastComposer channel="sms" accent={SMS_ACCENT} fg="#ffffff" />
        <BroadcastHistory channel="sms" accent={SMS_ACCENT} />
      </div>
    </div>
  );
}
