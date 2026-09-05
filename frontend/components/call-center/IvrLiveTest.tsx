"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PhoneCall, Loader2 } from "lucide-react";
import { Card, CardTitle } from "@/components/om/primitives/Card";
import { OmButton } from "@/components/om/primitives/OmButton";
import { callCenterApi, type CallOverview } from "@/lib/api/callcenter";
import { toast } from "@/lib/om/toast";
import { useState } from "react";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"];

/**
 * Runs a real call through the live IVR runtime (not the pure simulator) so you
 * can confirm the end-to-end path — ring → menu → routed to queue / voicemail.
 * Uses the simulated telephony provider; identical code path on a real trunk.
 */
export function IvrLiveTest() {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const { data } = useQuery({
    queryKey: ["call-center", "ivr-live"],
    queryFn: callCenterApi.poll,
    refetchInterval: 4000,
  });

  const inIvr = data?.ivrCalls ?? [];

  const apply = (o: CallOverview) => {
    qc.setQueryData(["call-center", "ivr-live"], {
      queue: o.queue,
      active: o.active,
      presence: o.presence,
      ivrCalls: o.ivrCalls,
    });
    qc.invalidateQueries({ queryKey: ["call-center", "overview"] });
  };

  const start = async () => {
    setBusy(true);
    try {
      apply(await callCenterApi.simulateIvrCall());
      toast.ok("Test call placed — it's in the menu now");
    } catch (e) {
      toast.err(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  const press = async (callId: string, digit: string) => {
    setBusy(true);
    try {
      apply(await callCenterApi.ivrPress(callId, digit));
    } catch (e) {
      toast.err(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card accent="violet" className="flex flex-col gap-2">
      <CardTitle icon={<PhoneCall />}>Test with a live call</CardTitle>
      <p className="text-[11px] text-om-muted">
        Places a real inbound call through the running flow. Watch it land in the Call Center queue or
        voicemail.
      </p>

      <OmButton variant="outline" size="sm" onClick={start} disabled={busy}>
        {busy ? <Loader2 className="animate-spin" /> : <PhoneCall />} Place a test call
      </OmButton>

      {inIvr.map((c) => (
        <div key={c.id} className="rounded-lg border border-om-border bg-om-bg/40 p-2">
          <div className="text-[12px] font-semibold">{c.name}</div>
          <div className="text-[10.5px] text-om-muted">{c.prompt || `In menu: ${c.menu}`}</div>
          <div className="mt-1.5 grid grid-cols-6 gap-1">
            {KEYS.map((k) => (
              <button
                key={k}
                disabled={busy}
                onClick={() => press(c.id, k)}
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
