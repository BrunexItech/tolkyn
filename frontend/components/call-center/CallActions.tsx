"use client";

import { PhoneIncoming } from "lucide-react";
import { OmButton } from "@/components/om/primitives/OmButton";
import { PresenceControl } from "./PresenceControl";
import { useCallCenter } from "./store";

export function CallActions() {
  const { simulateInbound } = useCallCenter();
  return (
    <div className="flex items-center gap-2">
      <OmButton variant="outline" size="sm" onClick={simulateInbound} title="Add a test inbound call to the queue">
        <PhoneIncoming /> Simulate inbound
      </OmButton>
      <PresenceControl />
    </div>
  );
}
