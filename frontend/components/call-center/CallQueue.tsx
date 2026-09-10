"use client";

import { PhoneIncoming, Phone, X } from "lucide-react";
import { Card, CardTitle } from "@/components/om/primitives/Card";
import { EmptyState } from "@/components/om/primitives/EmptyState";
import { Pill } from "@/components/om/primitives/Pill";
import { useCallCenter } from "./store";
import { formatDuration } from "@/lib/om/call-center";

export function CallQueue() {
  const { queue, answer, dismissQueued, active, softphone } = useCallCenter();
  // With a live SIP line the agent answers on the softphone (the incoming-call
  // card), not here — this list is then just visibility into who's ringing.
  const answerOnSoftphone = !!softphone?.configured && softphone.provider !== "simulated";

  return (
    <Card accent={queue.length ? "amber" : "default"}>
      <CardTitle
        icon={<PhoneIncoming />}
        action={
          queue.length ? (
            <Pill tone="amber" dot>
              {queue.length} waiting
            </Pill>
          ) : null
        }
      >
        Inbound queue
      </CardTitle>

      {queue.length === 0 ? (
        <EmptyState icon={<PhoneIncoming />} title="Queue is clear">
          New inbound calls will appear here.
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-1.5">
          {queue.map((c) => (
            <div
              key={c.id}
              className="flex items-center gap-2.5 rounded-lg border border-om-border bg-white/[0.02] p-2"
            >
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-om-amber/15 text-[10px] font-bold text-om-amber">
                {c.name
                  .split(" ")
                  .map((p) => p[0])
                  .join("")
                  .slice(0, 2)
                  .toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[12px] font-semibold">{c.name}</div>
                <div className="truncate text-[10.5px] text-om-muted">
                  {c.reason} · <span className="font-mono">{c.number}</span>
                </div>
              </div>
              <span className="shrink-0 font-mono text-[11px] text-om-amber">
                {formatDuration(c.waitedSec)}
              </span>
              {answerOnSoftphone ? (
                <span className="shrink-0 text-[10px] font-medium text-om-muted">
                  ringing your line
                </span>
              ) : (
                <button
                  onClick={() => answer(c.id)}
                  disabled={!!active}
                  className="grid size-8 shrink-0 place-items-center rounded-lg bg-om-green text-black transition-colors hover:brightness-105 disabled:opacity-40"
                  aria-label="Answer"
                >
                  <Phone className="size-3.5" />
                </button>
              )}
              <button
                onClick={() => dismissQueued(c.id)}
                className="grid size-7 shrink-0 place-items-center rounded-lg text-om-muted hover:bg-white/[0.05] hover:text-om-text"
                aria-label="Dismiss"
              >
                <X className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
