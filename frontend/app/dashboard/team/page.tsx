"use client";

import { useState } from "react";
import { UserCog, UserPlus, Users, UserCheck, Clock, ShieldCheck } from "lucide-react";
import { SectionHeading } from "@/components/om/primitives/SectionHeading";
import { Grid } from "@/components/om/primitives/Grid";
import { StatTile } from "@/components/om/primitives/StatTile";
import { Card, CardTitle } from "@/components/om/primitives/Card";
import { OmButton } from "@/components/om/primitives/OmButton";
import { InviteDialog } from "@/components/team/InviteDialog";
import { MemberList } from "@/components/team/MemberList";
import { useTeam, useTeamSummary } from "@/components/team/hooks";

export default function TeamPage() {
  const { data } = useTeam();
  const { data: summary } = useTeamSummary();
  const [open, setOpen] = useState(false);
  const members = data?.items ?? [];
  const roles = summary?.roles ?? [];

  return (
    <div className="om-anim-rise space-y-3">
      <SectionHeading
        title="Team"
        subtitle="Invite teammates and control what each role can do"
        icon={<UserCog />}
        actions={
          <OmButton variant="solid" size="sm" onClick={() => setOpen(true)}>
            <UserPlus /> Invite
          </OmButton>
        }
      />

      <Grid cols={4}>
        <StatTile label="Members" value={summary?.total ?? "—"} icon={<Users />} color="var(--om-blue)" />
        <StatTile label="Active" value={summary?.active ?? "—"} icon={<UserCheck />} color="var(--om-green)" />
        <StatTile label="Pending invites" value={summary?.pending ?? "—"} icon={<Clock />} color="var(--om-amber)" />
        <StatTile label="Roles" value={roles.length || "—"} icon={<ShieldCheck />} color="var(--om-violet)" />
      </Grid>

      <div className="grid gap-3 lg:grid-cols-[1.6fr_1fr]">
        <MemberList members={members} roles={roles} />

        <Card>
          <CardTitle icon={<ShieldCheck />}>Roles &amp; access</CardTitle>
          <div className="space-y-2.5">
            {roles.map((r) => (
              <div key={r.id} className="rounded-lg border border-om-border bg-white/[0.02] p-2.5">
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-[12px] font-semibold capitalize">{r.label}</span>
                  <span className="font-mono text-[10px] text-om-faint">
                    {summary?.by_role?.[r.id] ?? 0}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {r.permissions.map((p) => (
                    <span
                      key={p}
                      className={
                        p === "*"
                          ? "rounded bg-om-blue/15 px-1.5 py-px text-[9.5px] text-om-blue"
                          : "rounded bg-white/[0.05] px-1.5 py-px text-[9.5px] capitalize text-om-muted"
                      }
                    >
                      {p === "*" ? "full access" : p}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <InviteDialog open={open} onOpenChange={setOpen} roles={roles} />
    </div>
  );
}
