"use client";

import { PhoneOutgoing, Send, ShieldCheck } from "lucide-react";
import { SectionHeading } from "@/components/om/primitives/SectionHeading";
import { Grid } from "@/components/om/primitives/Grid";
import { StatTile } from "@/components/om/primitives/StatTile";
import { Pill } from "@/components/om/primitives/Pill";
import { BroadcastComposer } from "@/components/messaging/BroadcastComposer";
import { BroadcastHistory } from "@/components/messaging/BroadcastHistory";
import { useMessagingSummary } from "@/components/messaging/hooks";

const VOICE_ACCENT = "#f2a93b";

export default function VoiceBroadcastPage() {
  const { data: s } = useMessagingSummary();

  return (
    <div className="om-anim-rise space-y-3">
      <SectionHeading
        title="Voice Broadcast"
        subtitle="Automated calls to your phone books, leads and customers — the message only plays once a real person answers"
        icon={<PhoneOutgoing />}
        actions={
          <Pill tone="green" dot>
            Answer-detected
          </Pill>
        }
      />

      <Grid cols={2}>
        <StatTile
          label="Voice campaigns"
          value={s?.voice_broadcasts ?? "—"}
          icon={<Send />}
          color={VOICE_ACCENT}
          loading={!s}
        />
        <StatTile
          label="Protection"
          value="AMD on"
          icon={<ShieldCheck />}
          color="var(--om-green)"
          loading={!s}
        />
      </Grid>

      <div className="grid gap-3 lg:grid-cols-[1.1fr_0.9fr]">
        <BroadcastComposer channel="voice" accent={VOICE_ACCENT} fg="#1a1300" />
        <BroadcastHistory channel="voice" accent={VOICE_ACCENT} />
      </div>
    </div>
  );
}
