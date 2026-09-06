"use client";

import { useState } from "react";
import { Search, Users, ChevronLeft, ChevronRight } from "lucide-react";
import { SectionHeading } from "@/components/om/primitives/SectionHeading";
import { Card } from "@/components/om/primitives/Card";
import { TableWrap } from "@/components/om/primitives/Table";
import { EmptyState } from "@/components/om/primitives/EmptyState";
import { OmButton } from "@/components/om/primitives/OmButton";
import { StatusBadge, type BadgeTone } from "@/components/om/primitives/StatusBadge";
import { UserDetailDrawer } from "@/components/admin/UserDetailDrawer";
import { usePlatformUsers, useApproveUser } from "@/components/admin/hooks";
import { relativeTime } from "@/lib/om/format";
import type { PlatformUser } from "@/lib/api/admin";
import { Check } from "lucide-react";

const STATUS_TONE: Record<string, BadgeTone> = { active: "green", invited: "blue", suspended: "red", inactive: "muted" };
const LIMIT = 25;

export default function AdminUsersPage() {
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("");
  const [status, setStatus] = useState("");
  const [approval, setApproval] = useState("");
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<PlatformUser | null>(null);
  const approve = useApproveUser();

  const { data, isLoading } = usePlatformUsers({
    search: search || undefined,
    role: role || undefined,
    status: status || undefined,
    approval: approval || undefined,
    limit: LIMIT,
    offset,
  });
  const total = data?.total ?? 0;

  return (
    <div className="space-y-3">
      <SectionHeading
        title="Users & rights"
        subtitle="Every account on the platform, across every workspace — change role, suspend, or dig into usage"
        icon={<Users />}
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-om-muted" />
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setOffset(0); }}
            placeholder="Search name or email"
            className="w-full rounded-lg border border-om-border bg-white/[0.03] py-1.5 pl-8 pr-3 text-[12px] text-om-text outline-none placeholder:text-om-muted focus:border-om-violet/60"
          />
        </div>
        <select value={role} onChange={(e) => { setRole(e.target.value); setOffset(0); }} className="rounded-lg border border-om-border bg-white/[0.03] px-2 py-1.5 text-[11.5px] text-om-dim outline-none">
          <option value="">All roles</option>
          {["owner", "admin", "manager", "editor", "viewer", "contributor"].map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <select value={status} onChange={(e) => { setStatus(e.target.value); setOffset(0); }} className="rounded-lg border border-om-border bg-white/[0.03] px-2 py-1.5 text-[11.5px] text-om-dim outline-none">
          <option value="">All statuses</option>
          {["active", "invited", "suspended", "inactive"].map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={approval} onChange={(e) => { setApproval(e.target.value); setOffset(0); }} className="rounded-lg border border-om-border bg-white/[0.03] px-2 py-1.5 text-[11.5px] text-om-dim outline-none">
          <option value="">All accounts</option>
          <option value="pending">Pending approval</option>
          <option value="approved">Approved</option>
        </select>
      </div>

      <Card noEdge className="p-0">
        {isLoading ? (
          <EmptyState loading title="Loading…" />
        ) : !data || data.items.length === 0 ? (
          <EmptyState icon={<Users />} title="No users match" />
        ) : (
          <>
            <TableWrap>
              <table>
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Role</th>
                    <th>Status</th>
                    <th>Access</th>
                    <th>Last seen</th>
                    <th>Joined</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((u) => (
                    <tr key={u.id} onClick={() => setSelected(u)} className="cursor-pointer">
                      <td>
                        <div className="font-medium">{u.name}</div>
                        <div className="text-[10.5px] text-om-muted">{u.email}</div>
                      </td>
                      <td className="capitalize text-om-dim">{u.role}</td>
                      <td><StatusBadge tone={STATUS_TONE[u.status] ?? "muted"}>{u.status}</StatusBadge></td>
                      <td onClick={(e) => e.stopPropagation()}>
                        {u.is_approved ? (
                          <StatusBadge tone="green">Approved</StatusBadge>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <StatusBadge tone="amber">Pending</StatusBadge>
                            <OmButton
                              variant="ghost"
                              size="xs"
                              disabled={approve.isPending}
                              onClick={() => approve.mutate(u.id)}
                            >
                              <Check /> Allow
                            </OmButton>
                          </div>
                        )}
                      </td>
                      <td className="text-om-muted">{u.last_login_at ? relativeTime(u.last_login_at) : "never"}</td>
                      <td className="text-om-muted">{relativeTime(u.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
            <div className="flex items-center justify-between border-t border-om-border px-3 py-2 text-[11px] text-om-muted">
              <span>{offset + 1}–{Math.min(offset + LIMIT, total)} of {total}</span>
              <div className="flex gap-1">
                <OmButton variant="ghost" size="xs" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - LIMIT))}>
                  <ChevronLeft /> Prev
                </OmButton>
                <OmButton variant="ghost" size="xs" disabled={offset + LIMIT >= total} onClick={() => setOffset(offset + LIMIT)}>
                  Next <ChevronRight />
                </OmButton>
              </div>
            </div>
          </>
        )}
      </Card>

      <UserDetailDrawer user={selected} onOpenChange={(v) => !v && setSelected(null)} />
    </div>
  );
}
