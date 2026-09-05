"use client";

import { Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardTitle } from "@/components/om/primitives/Card";
import { useCallCenter } from "./store";
import type { AgentStatus } from "@/lib/om/call-center";

const DOT: Record<AgentStatus, string> = {
  available: "bg-om-green",
  "on-call": "bg-om-blue",
  away: "bg-om-amber",
  offline: "bg-om-faint",
};

const LABEL: Record<AgentStatus, string> = {
  available: "Available",
  "on-call": "On call",
  away: "Away",
  offline: "Offline",
};

export function AgentPresence() {
  const { agents } = useCallCenter();
  const online = agents.filter((a) => a.status !== "offline").length;

  return (
    <Card>
      <CardTitle
        icon={<Users />}
        action={<span className="text-[10.5px] text-om-muted">{online} online</span>}
      >
        Agents
      </CardTitle>
      <div className="flex flex-col">
        {agents.map((a) => (
          <div
            key={a.id}
            className="flex items-center gap-2.5 border-b border-white/[0.04] py-2 last:border-0"
          >
            <span className="relative grid size-7 shrink-0 place-items-center rounded-full bg-white/[0.05] text-[10px] font-bold text-om-dim">
              {a.initials}
              <span
                className={cn(
                  "absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full border-2 border-om-card",
                  DOT[a.status],
                )}
              />
            </span>
            <span className="flex-1 truncate text-[12px] font-medium">{a.name}</span>
            <span className="text-[10.5px] text-om-muted">{LABEL[a.status]}</span>
            <span className="w-8 shrink-0 text-right font-mono text-[11px] text-om-dim">
              {a.callsToday}
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}
