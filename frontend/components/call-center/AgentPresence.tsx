"use client";

import { useState } from "react";
import { Users, Check, X, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardTitle } from "@/components/om/primitives/Card";
import { OmButton } from "@/components/om/primitives/OmButton";
import { Field, OmInput } from "@/components/om/primitives/Field";
import { useMyRole } from "@/components/team/hooks";
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

/**
 * One roster — who's online (everyone sees this) plus, for the owner on a
 * real trunk, each agent's SIP line. Used to be two separate cards (this
 * one + AgentLineSettings) showing the same agent list twice side by side;
 * merged so the roster only appears once.
 */
export function AgentPresence() {
  const { data: myRole } = useMyRole();
  const { agents, softphone, setAgentSip } = useCallCenter();
  const online = agents.filter((a) => a.status !== "offline").length;

  const canEditLines = !!myRole?.is_owner && !!softphone && softphone.provider !== "simulated";
  const [editing, setEditing] = useState<string | null>(null);
  const [ext, setExt] = useState("");
  const [pw, setPw] = useState("");

  const start = (id: string, current: string | null) => {
    setEditing(id);
    setExt(current ?? "");
    setPw("");
  };
  const save = (id: string) => {
    setAgentSip(id, ext.trim(), pw);
    setEditing(null);
  };

  return (
    <Card>
      <CardTitle
        icon={<Users />}
        action={<span className="text-[10.5px] text-om-muted">{online} online</span>}
      >
        Agents
      </CardTitle>
      <div className="flex flex-col divide-y divide-white/[0.04]">
        {agents.map((a) => (
          <div key={a.id} className="py-2">
            <div className="flex items-center gap-2.5">
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
              <span className="hidden text-[10.5px] text-om-muted sm:inline">{LABEL[a.status]}</span>
              <span className="w-8 shrink-0 text-right font-mono text-[11px] text-om-dim">
                {a.callsToday}
              </span>
              {canEditLines && editing !== a.id && (
                <>
                  <span className="font-mono text-[10.5px] text-om-faint">
                    {a.sipExtension ? `ext ${a.sipExtension}` : "no line"}
                  </span>
                  <button
                    onClick={() => start(a.id, a.sipExtension)}
                    className="grid size-6 shrink-0 place-items-center rounded-md text-om-muted hover:bg-white/[0.06] hover:text-om-text"
                    title="Edit SIP line"
                  >
                    <Pencil className="size-3" />
                  </button>
                </>
              )}
            </div>

            {canEditLines && editing === a.id && (
              <div className="mt-2 rounded-lg border border-om-border bg-om-bg/50 p-2">
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Extension" className="mb-0">
                    <OmInput value={ext} onChange={(e) => setExt(e.target.value)} placeholder="1001" />
                  </Field>
                  <Field label="SIP password" className="mb-0">
                    <OmInput
                      type="password"
                      value={pw}
                      onChange={(e) => setPw(e.target.value)}
                      placeholder="from PBX"
                      autoComplete="new-password"
                    />
                  </Field>
                </div>
                <div className="mt-2 flex justify-end gap-1.5">
                  <OmButton variant="ghost" size="sm" onClick={() => setEditing(null)}>
                    <X /> Cancel
                  </OmButton>
                  <OmButton variant="solid" size="sm" onClick={() => save(a.id)}>
                    <Check /> Save
                  </OmButton>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}
