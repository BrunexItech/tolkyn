"use client";

import { cn } from "@/lib/utils";
import { useCallCenter } from "./store";
import type { AgentStatus } from "@/lib/om/call-center";

const OPTIONS: { id: AgentStatus; label: string; dot: string }[] = [
  { id: "available", label: "Available", dot: "bg-om-green" },
  { id: "away", label: "Away", dot: "bg-om-amber" },
  { id: "offline", label: "Offline", dot: "bg-om-faint" },
];

/** Segmented presence toggle for the current agent. */
export function PresenceControl() {
  const { status, setStatus, active } = useCallCenter();
  const effective: AgentStatus = active ? "on-call" : status;

  return (
    <div className="flex items-center rounded-lg border border-om-border bg-white/[0.02] p-0.5">
      {active ? (
        <span className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold text-om-blue">
          <span className="size-1.5 rounded-full bg-om-blue om-live-dot" /> On call
        </span>
      ) : (
        OPTIONS.map((o) => (
          <button
            key={o.id}
            onClick={() => setStatus(o.id)}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors",
              effective === o.id
                ? "bg-white/[0.06] text-om-text"
                : "text-om-muted hover:text-om-dim",
            )}
          >
            <span className={cn("size-1.5 rounded-full", o.dot)} />
            {o.label}
          </button>
        ))
      )}
    </div>
  );
}
