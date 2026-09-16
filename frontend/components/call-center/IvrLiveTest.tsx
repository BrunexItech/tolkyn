"use client";

import { PhoneCall, Loader2 } from "lucide-react";
import { Card, CardTitle } from "@/components/om/primitives/Card";
import { OmButton } from "@/components/om/primitives/OmButton";
import type { IvrCall } from "@/lib/api/callcenter";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"];

/**
 * Runs a real call through the live IVR runtime (not the pure simulator) so you
 * can confirm the end-to-end path — ring → menu → routed to queue / voicemail.
 * Uses the simulated telephony provider; identical code path on a real trunk.
 */
export function IvrLiveTest({
  ivrCalls,
  busy,
  onStart,
  onPress,
}: {
  ivrCalls: IvrCall[];
  busy: boolean;
  onStart: () => void;
  onPress: (callId: string, digit: string) => void;
}) {
  return (
    <Card accent="violet" className="flex flex-col gap-2">
      <CardTitle icon={<PhoneCall />}>Test with a live call</CardTitle>
      <p className="text-[11px] text-om-muted">
        Places a real inbound call through the running flow. Watch it land in the Call Center queue or
        voicemail.
      </p>

      <OmButton variant="outline" size="sm" onClick={onStart} disabled={busy}>
        {busy ? <Loader2 className="animate-spin" /> : <PhoneCall />} Place a test call
      </OmButton>

      {ivrCalls.map((c) => (
        <div key={c.id} className="rounded-lg border border-om-border bg-om-bg/40 p-2">
          <div className="text-[12px] font-semibold">{c.name}</div>
          <div className="text-[10.5px] text-om-muted">{c.prompt || `In menu: ${c.menu}`}</div>
          <div className="mt-1.5 grid grid-cols-6 gap-1">
            {KEYS.map((k) => (
              <button
                key={k}
                disabled={busy}
                onClick={() => onPress(c.id, k)}
                className="h-7 rounded-md border border-om-border bg-white/[0.02] font-mono text-[12px] font-semibold hover:border-om-violet/50 hover:bg-om-violet/10 disabled:opacity-40"
              >
                {k}
              </button>
            ))}
          </div>
        </div>
      ))}
    </Card>
  );
}
