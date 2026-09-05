import Link from "next/link";
import { GitBranch, Headset } from "lucide-react";
import { SectionHeading } from "@/components/om/primitives/SectionHeading";
import { OmButton } from "@/components/om/primitives/OmButton";
import { Grid } from "@/components/om/primitives/Grid";
import { CallCenterProvider } from "@/components/call-center/store";
import { CallActions } from "@/components/call-center/CallActions";
import { CallStats } from "@/components/call-center/CallStats";
import { Softphone } from "@/components/call-center/Softphone";
import { AgentLineSettings } from "@/components/call-center/AgentLineSettings";
import { CallQueue } from "@/components/call-center/CallQueue";
import { AgentPresence } from "@/components/call-center/AgentPresence";
import { CallVolumeCard } from "@/components/call-center/CallVolumeCard";
import { RecentCalls } from "@/components/call-center/RecentCalls";

export default function CallCenterPage() {
  return (
    <CallCenterProvider>
      <div className="om-anim-rise space-y-3">
        <SectionHeading
          title="Call Center"
          subtitle="Inbound & outbound voice for your team"
          icon={<Headset />}
          actions={
            <>
              <OmButton asChild variant="outline" size="sm">
                <Link href="/dashboard/calls/flow">
                  <GitBranch /> Call flow
                </Link>
              </OmButton>
              <CallActions />
            </>
          }
        />

        <CallStats />

        <div className="grid gap-3 lg:grid-cols-[340px_1fr]">
          <div className="space-y-3">
            <Softphone />
            <AgentLineSettings />
          </div>
          <div className="space-y-3">
            <Grid cols={2}>
              <CallQueue />
              <AgentPresence />
            </Grid>
            <CallVolumeCard />
          </div>
        </div>

        <RecentCalls />
      </div>
    </CallCenterProvider>
  );
}
