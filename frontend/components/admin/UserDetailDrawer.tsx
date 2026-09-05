"use client";

import { useEffect, useState } from "react";
import { Check, Clapperboard } from "lucide-react";
import { Drawer } from "@/components/om/primitives/Drawer";
import { StatusBadge, type BadgeTone } from "@/components/om/primitives/StatusBadge";
import { OmButton } from "@/components/om/primitives/OmButton";
import { compact, relativeTime, shortDateTime } from "@/lib/om/format";
import { useUserUsage, useUpdateUser, useApproveUser, useVideoModelCatalog, usePackages } from "./hooks";
import type { PlatformUser } from "@/lib/api/admin";

const ROLES = ["owner", "admin", "manager", "editor", "viewer", "contributor"];
const STATUSES = ["active", "invited", "suspended", "inactive"];
const STATUS_TONE: Record<string, BadgeTone> = {
  active: "green",
  invited: "blue",
  suspended: "red",
  inactive: "muted",
};

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-om-faint">{children}</div>
  );
}

export function UserDetailDrawer({ user, onOpenChange }: { user: PlatformUser | null; onOpenChange: (v: boolean) => void }) {
  const { data: usage } = useUserUsage(user?.id ?? null);
  const { data: videoModels } = useVideoModelCatalog();
  const { data: pkgData } = usePackages();
  const update = useUpdateUser();
  const approve = useApproveUser();

  const [budgetInput, setBudgetInput] = useState("");
  useEffect(() => {
    setBudgetInput(user?.video_budget_usd != null ? String(user.video_budget_usd) : "");
  }, [user?.id, user?.video_budget_usd]);

  const toggleModel = (key: string) => {
    if (!user) return;
    const current = user.allowed_video_models ?? [];
    const next = current.includes(key) ? current.filter((k) => k !== key) : [...current, key];
    update.mutate({ id: user.id, allowed_video_models: next });
  };

  const commitBudget = () => {
    if (!user) return;
    const trimmed = budgetInput.trim();
    const value = trimmed === "" ? null : Number(trimmed);
    if (value !== null && (Number.isNaN(value) || value < 0)) return;
    if (value === user.video_budget_usd) return;
    update.mutate({ id: user.id, video_budget_usd: value });
  };

  return (
    <Drawer
      open={!!user}
      onOpenChange={onOpenChange}
      title={user?.name ?? "User"}
      subtitle={user?.email}
      width={420}
    >
      {!user ? (
        <div className="py-10 text-center text-[12px] text-om-muted">Loading…</div>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <StatusBadge tone={STATUS_TONE[user.status] ?? "muted"}>{user.status}</StatusBadge>
            <StatusBadge tone={user.is_approved ? "green" : "amber"}>
              {user.is_approved ? "Approved" : "Pending approval"}
            </StatusBadge>
            {!user.is_email_verified && <span className="text-[10.5px] text-om-amber">Email unverified</span>}
          </div>

          {!user.is_approved && (
            <div className="flex items-center justify-between gap-2 rounded-md border border-om-amber/25 bg-om-amber/[0.07] px-2.5 py-1.5">
              <p className="text-[10.5px] text-om-amber">
                This user registered but hasn&apos;t been let into the main app yet.
              </p>
              <OmButton variant="solid" size="xs" disabled={approve.isPending} onClick={() => approve.mutate(user.id)}>
                <Check /> Allow
              </OmButton>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <SectionLabel>Role</SectionLabel>
              <select
                value={user.role}
                onChange={(e) => update.mutate({ id: user.id, role: e.target.value })}
                className="w-full rounded-lg border border-om-border bg-white/[0.03] px-2.5 py-2 text-[12px] text-om-text outline-none focus:border-om-violet/60"
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>
            <div>
              <SectionLabel>Status</SectionLabel>
              <select
                value={user.status}
                onChange={(e) => update.mutate({ id: user.id, status: e.target.value })}
                className="w-full rounded-lg border border-om-border bg-white/[0.03] px-2.5 py-2 text-[12px] text-om-text outline-none focus:border-om-violet/60"
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          </div>
          {user.status !== "active" && (
            <p className="rounded-md border border-om-amber/25 bg-om-amber/[0.07] px-2.5 py-1.5 text-[10.5px] text-om-amber">
              This user cannot log in while their status isn&apos;t &quot;active&quot;.
            </p>
          )}

          <div>
            <SectionLabel>Pricing package</SectionLabel>
            <select
              value={user.package_id ?? ""}
              onChange={(e) => update.mutate({ id: user.id, package_id: e.target.value || null })}
              className="w-full rounded-lg border border-om-border bg-white/[0.03] px-2.5 py-2 text-[12px] text-om-text outline-none focus:border-om-violet/60"
            >
              <option value="">No package — full access (grandfathered)</option>
              {(pkgData?.items ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.modules.includes("*") ? " · all modules" : ` · ${p.modules.length} modules`}
                </option>
              ))}
            </select>
            <p className="mt-1 text-[10px] text-om-faint">
              Controls which sections of the platform this user&apos;s whole workspace can reach.
            </p>
          </div>

          <div>
            <SectionLabel>Usage on the platform</SectionLabel>
            {!usage ? (
              <p className="text-[11.5px] text-om-muted">Loading…</p>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {[
                  ["Leads", usage.leads],
                  ["Customers", usage.customers],
                  ["Posts live", usage.posts_published],
                  ["Broadcasts", usage.broadcasts_sent],
                  ["Automations", usage.automations],
                  ["Connected", usage.connected_accounts],
                  ["Videos made", usage.video_jobs],
                  ["Video spend", `$${usage.video_spend_usd.toFixed(2)}`],
                ].map(([label, val]) => (
                  <div key={label as string} className="rounded-lg border border-om-border bg-white/[0.02] p-2 text-center">
                    <div className="font-mono text-[15px] font-bold text-om-text">
                      {typeof val === "number" ? compact(val) : val}
                    </div>
                    <div className="text-[9.5px] text-om-muted">{label}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <SectionLabel>Video generation access</SectionLabel>
            <div className="space-y-1.5">
              {(videoModels ?? []).map((m) => {
                const allowed = user.allowed_video_models.length === 0 || user.allowed_video_models.includes(m.key);
                const restricted = user.allowed_video_models.length > 0;
                return (
                  <label
                    key={m.key}
                    className="flex items-center gap-2 rounded-lg border border-om-border bg-white/[0.02] px-2.5 py-1.5"
                  >
                    <input
                      type="checkbox"
                      checked={restricted ? user.allowed_video_models.includes(m.key) : true}
                      onChange={() => toggleModel(m.key)}
                      className="size-3.5 accent-om-violet"
                    />
                    <span className="flex-1 text-[11.5px] text-om-dim">{m.label}</span>
                    {!restricted && <span className="text-[9.5px] text-om-faint">unrestricted</span>}
                    {restricted && !allowed && <span className="text-[9.5px] text-om-amber">blocked</span>}
                  </label>
                );
              })}
              <p className="text-[10px] text-om-faint">
                Leaving every box checked means no restriction. Uncheck one to block that model for this user.
              </p>
            </div>

            <div className="mt-2">
              <SectionLabel>Video budget (USD)</SectionLabel>
              <input
                type="number"
                min={0}
                step={0.5}
                value={budgetInput}
                onChange={(e) => setBudgetInput(e.target.value)}
                onBlur={commitBudget}
                onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
                placeholder="No cap"
                className="w-full rounded-lg border border-om-border bg-white/[0.03] px-2.5 py-2 text-[12px] text-om-text outline-none focus:border-om-violet/60"
              />
              <p className="mt-1 flex items-center gap-1 text-[10px] text-om-faint">
                <Clapperboard className="size-3" /> Blank = unlimited. Generation is blocked once spend would exceed this.
              </p>
            </div>
          </div>

          <div className="text-[10.5px] text-om-faint">
            Joined {shortDateTime(user.created_at)}
            {user.last_login_at ? ` · last seen ${relativeTime(user.last_login_at)}` : " · never logged in"}
          </div>
        </>
      )}
    </Drawer>
  );
}
