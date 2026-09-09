"use client";

import { useState } from "react";
import { PhoneCall, Check, X, Pencil } from "lucide-react";
import { Card, CardTitle } from "@/components/om/primitives/Card";
import { OmButton } from "@/components/om/primitives/OmButton";
import { Field, OmInput } from "@/components/om/primitives/Field";
import { useMyRole } from "@/components/team/hooks";
import { useCallCenter } from "./store";

/**
 * Owner-only panel: assign each agent a SIP extension + password on the
 * workspace's trunk. Only shown once an admin has connected a real trunk
 * (softphone.provider === "cloudone").
 */
export function AgentLineSettings() {
  const { data: myRole } = useMyRole();
  const { agents, softphone, setAgentSip } = useCallCenter();
  const [editing, setEditing] = useState<string | null>(null);
  const [ext, setExt] = useState("");
  const [pw, setPw] = useState("");

  if (!myRole?.is_owner) return null;
  if (!softphone || softphone.provider === "simulated") return null;

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
    <Card accent="violet">
      <CardTitle icon={<PhoneCall />}>Agent lines (SIP trunk)</CardTitle>
      <p className="mb-2 text-[11px] text-om-muted">
        Each agent needs an extension + password from the PBX. Leave the extension blank and save to
        remove an agent&apos;s line.
      </p>
      <div className="flex flex-col divide-y divide-white/[0.05]">
        {agents.map((a) => (
          <div key={a.id} className="py-2">
            <div className="flex items-center gap-2">
              <span className="grid size-7 shrink-0 place-items-center rounded-full bg-white/[0.05] text-[10px] font-bold text-om-dim">
                {a.initials}
              </span>
              <span className="flex-1 truncate text-[12px] font-medium">
                {a.name}
                {a.isSelf && <span className="ml-1 text-[10px] text-om-muted">(you)</span>}
              </span>
              {editing === a.id ? null : (
                <>
                  <span className="font-mono text-[11px] text-om-dim">
                    {a.sipExtension ? `ext ${a.sipExtension}` : "no line"}
                  </span>
                  <button
                    onClick={() => start(a.id, a.sipExtension)}
                    className="grid size-6 place-items-center rounded-md text-om-muted hover:bg-white/[0.06] hover:text-om-text"
                  >
                    <Pencil className="size-3" />
                  </button>
                </>
              )}
            </div>

            {editing === a.id && (
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
