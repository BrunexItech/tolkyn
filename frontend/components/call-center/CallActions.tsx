"use client";

import { PhoneIncoming } from "lucide-react";
import { OmButton } from "@/components/om/primitives/OmButton";
import { PresenceControl } from "./PresenceControl";
import { useCallCenter } from "./store";

export function CallActions() {
  const { simulateInbound, softphone } = useCallCenter();
  // Only offered while the workspace has no real trunk connected -- once a
  // real line is live, a test call here would create a fake entry in that
  // workspace's ACTUAL call history/stats, indistinguishable from a real
  // one. Demo-only tool for exploring the UI before telephony is wired up.
  const isSimulatedMode = !softphone || softphone.provider === "simulated";
  if (!isSimulatedMode) {
    return (
      <div className="flex items-center gap-2">
        <PresenceControl />
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <OmButton variant="outline" size="sm" onClick={simulateInbound} title="Add a test inbound call to the queue">
        <PhoneIncoming /> Simulate inbound
      </OmButton>
      <PresenceControl />
    </div>
  );
}
