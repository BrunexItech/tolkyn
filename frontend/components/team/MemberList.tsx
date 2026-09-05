"use client";

import { Mail, Trash2, Send } from "lucide-react";
import { Card, CardTitle } from "@/components/om/primitives/Card";
import { TableWrap } from "@/components/om/primitives/Table";
import { StatusBadge, type BadgeTone } from "@/components/om/primitives/StatusBadge";
import { OmButton } from "@/components/om/primitives/OmButton";
import { EmptyState } from "@/components/om/primitives/EmptyState";
import { useRemoveMember, useResendInvite, useUpdateMember } from "./hooks";
import type { MemberStatus, RoleInfo, TeamMember, TeamRole } from "@/lib/api/team";
import { relativeTime } from "@/lib/om/format";

const STATUS_TONE: Record<MemberStatus, BadgeTone> = {
  active: "green",
  invited: "amber",
  suspended: "red",
};

function initials(m: TeamMember) {
  const s = (m.name || m.email).trim();
  const parts = s.split(/\s+/);
  return (parts[0]?.[0] ?? "").concat(parts[1]?.[0] ?? "").toUpperCase() || s.slice(0, 2).toUpperCase();
}

export function MemberList({ members, roles }: { members: TeamMember[]; roles: RoleInfo[] }) {
  const update = useUpdateMember();
  const resend = useResendInvite();
  const remove = useRemoveMember();
  const assignable = roles.filter((r) => r.id !== "owner");

  return (
    <Card noEdge className="p-0">
      <div className="border-b border-om-border px-3 py-2.5">
        <CardTitle icon={<Mail />}>Members</CardTitle>
      </div>
      {members.length === 0 ? (
        <EmptyState title="No teammates yet" />
      ) : (
        <TableWrap>
          <table>
            <thead>
              <tr>
                <th>Member</th>
                <th>Role</th>
                <th>Status</th>
                <th>Activity</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {members.map((m) => {
                const isOwner = m.role === "owner";
                return (
                  <tr key={m.id}>
                    <td>
                      <div className="flex items-center gap-2">
                        <span
                          className="grid size-7 shrink-0 place-items-center rounded-full text-[10px] font-semibold text-white"
                          style={{ background: m.avatar_color ?? "#4f7aff" }}
                        >
                          {initials(m)}
                        </span>
                        <div className="min-w-0">
                          <div className="truncate font-medium">{m.name || m.email}</div>
                          <div className="truncate text-[10px] text-om-muted">
                            {m.title ? `${m.title} · ` : ""}
                            {m.email}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td>
                      {isOwner ? (
                        <StatusBadge tone="blue">owner</StatusBadge>
                      ) : (
                        <select
                          value={m.role}
                          onChange={(e) => update.mutate({ id: m.id, role: e.target.value as TeamRole })}
                          className="rounded-lg border border-om-border bg-white/[0.03] px-2 py-1 text-[11px] capitalize text-om-dim outline-none"
                        >
                          {assignable.map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.label}
                            </option>
                          ))}
                        </select>
                      )}
                    </td>
                    <td>
                      <StatusBadge tone={STATUS_TONE[m.status]}>{m.status}</StatusBadge>
                    </td>
                    <td className="text-[10.5px] text-om-muted">
                      {m.status === "invited"
                        ? m.invited_at
                          ? `invited ${relativeTime(m.invited_at)}`
                          : "invited"
                        : m.last_active_at
                          ? `active ${relativeTime(m.last_active_at)}`
                          : m.joined_at
                            ? `joined ${relativeTime(m.joined_at)}`
                            : "—"}
                    </td>
                    <td>
                      {!isOwner && (
                        <div className="flex items-center justify-end gap-1">
                          {m.status === "invited" && (
                            <OmButton variant="ghost" size="xs" onClick={() => resend.mutate(m.id)}>
                              <Send /> Resend
                            </OmButton>
                          )}
                          <OmButton variant="ghost" size="xs" onClick={() => remove.mutate(m.id)}>
                            <Trash2 />
                          </OmButton>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableWrap>
      )}
    </Card>
  );
}
