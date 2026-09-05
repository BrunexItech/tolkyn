"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Plus, Globe, Trash2, Pause, Play, Activity, ShieldAlert } from "lucide-react";
import { SectionHeading } from "@/components/om/primitives/SectionHeading";
import { Card, CardTitle } from "@/components/om/primitives/Card";
import { OmButton } from "@/components/om/primitives/OmButton";
import { EmptyState } from "@/components/om/primitives/EmptyState";
import { StatusBadge, type BadgeTone } from "@/components/om/primitives/StatusBadge";
import { useConfirm } from "@/components/om/primitives/ConfirmDialog";
import { CreateOrganizationDialog } from "@/components/admin/CreateOrganizationDialog";
import { CreateSubsidiaryDialog } from "@/components/admin/CreateSubsidiaryDialog";
import {
  useOrganizations,
  useUpdateOrganization,
  useDeleteOrganization,
  useUpdateSubsidiary,
  useDeleteSubsidiary,
  useApprovedUsers,
} from "@/components/admin/hooks";
import type { Organization } from "@/lib/api/admin";

const ORG_TONE: Record<string, BadgeTone> = { active: "green", suspended: "red" };
const SUB_TONE: Record<string, BadgeTone> = { active: "green", suspended: "red", pending: "amber" };

export default function OrganizationsPage() {
  const router = useRouter();
  const { data: orgs, isLoading } = useOrganizations();
  const { data: approvedUsers } = useApprovedUsers();
  const updateOrg = useUpdateOrganization();
  const deleteOrg = useDeleteOrganization();
  const updateSub = useUpdateSubsidiary();
  const deleteSub = useDeleteSubsidiary();
  const { confirm, dialog } = useConfirm();

  const [createOrgOpen, setCreateOrgOpen] = useState(false);
  const [subDialogOrg, setSubDialogOrg] = useState<Organization | null>(null);

  const viewSubdomainActivity = (workspaceId: string | null, label: string) => {
    if (!workspaceId) return;
    router.push(`/admin/activity?workspace_id=${workspaceId}&label=${encodeURIComponent(label)}`);
  };

  return (
    <div className="space-y-3">
      <SectionHeading
        title="Organizations & subdomains"
        subtitle="Only the control room can create a subdomain — this never happens from tenant signup"
        icon={<Building2 />}
        actions={
          <OmButton variant="solid" size="sm" onClick={() => setCreateOrgOpen(true)}>
            <Plus /> New organization
          </OmButton>
        }
      />

      {isLoading ? (
        <Card><EmptyState title="Loading…" /></Card>
      ) : !orgs || orgs.length === 0 ? (
        <Card><EmptyState icon={<Building2 />} title="No organizations yet">Create the first one to start assigning subdomains.</EmptyState></Card>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {orgs.map((org) => (
            <Card key={org.id}>
              <CardTitle
                icon={<Building2 />}
                action={
                  <div className="flex items-center gap-1">
                    <StatusBadge tone={ORG_TONE[org.status] ?? "muted"}>{org.status}</StatusBadge>
                    <button
                      title={org.status === "active" ? "Suspend organization" : "Reactivate organization"}
                      onClick={() => updateOrg.mutate({ id: org.id, status: org.status === "active" ? "suspended" : "active" })}
                      className="grid size-6 place-items-center rounded-md text-om-muted hover:bg-white/[0.06] hover:text-om-text"
                    >
                      {org.status === "active" ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
                    </button>
                    <button
                      title="Delete organization"
                      onClick={async () => {
                        if (
                          await confirm({
                            title: "Delete organization?",
                            message: (
                              <>
                                <strong className="text-om-text">{org.name}</strong> and all its
                                subdomains will be permanently deleted.
                              </>
                            ),
                            confirmLabel: "Delete",
                            danger: true,
                          })
                        )
                          deleteOrg.mutate(org.id);
                      }}
                      className="grid size-6 place-items-center rounded-md text-om-muted hover:bg-om-red/10 hover:text-om-red"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                }
              >
                {org.name}
              </CardTitle>
              <p className="text-[10.5px] text-om-faint">slug: {org.slug}</p>
              {org.notes && <p className="mt-1 text-[11.5px] text-om-dim">{org.notes}</p>}

              <div className="mt-2.5">
                <div className="mb-1 text-[9.5px] font-semibold uppercase tracking-[0.08em] text-om-faint">Main account</div>
                <select
                  value={org.owner_user_id ?? ""}
                  onChange={(e) => updateOrg.mutate({ id: org.id, owner_user_id: e.target.value || null })}
                  className="w-full rounded-lg border border-om-border bg-white/[0.03] px-2.5 py-1.5 text-[11.5px] text-om-text outline-none focus:border-om-violet/60"
                >
                  <option value="">Not linked — no main account</option>
                  {approvedUsers?.items.map((u) => (
                    <option key={u.id} value={u.id}>{u.name} — {u.email}</option>
                  ))}
                </select>
                {!org.owner_user_id && (
                  <p className="mt-1 flex items-center gap-1 text-[10px] text-om-amber">
                    <ShieldAlert className="size-3" /> Subdomains are blocked until a real account is linked.
                  </p>
                )}
              </div>

              <div className="mt-3 space-y-1.5">
                {org.subsidiaries.length === 0 ? (
                  <p className="text-[11px] text-om-muted">No subdomains yet.</p>
                ) : (
                  org.subsidiaries.map((sub) => (
                    <div key={sub.id} className="flex items-center gap-2 rounded-lg border border-om-border bg-white/[0.02] px-2.5 py-1.5">
                      <Globe className="size-3.5 shrink-0 text-om-violet" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[12px] font-medium text-om-text">{sub.name}</div>
                        <div className="truncate font-mono text-[10px] text-om-muted">{sub.subdomain}.tolkyn.co.ke</div>
                      </div>
                      <StatusBadge tone={SUB_TONE[sub.status] ?? "muted"}>{sub.status}</StatusBadge>
                      <button
                        title="See what's happened on this subdomain"
                        disabled={!sub.workspace_id}
                        onClick={() => viewSubdomainActivity(sub.workspace_id, sub.name)}
                        className="grid size-6 shrink-0 place-items-center rounded-md text-om-muted hover:bg-white/[0.06] hover:text-om-text disabled:opacity-30"
                      >
                        <Activity className="size-3.5" />
                      </button>
                      <button
                        title={sub.status === "active" ? "Suspend" : "Reactivate"}
                        onClick={() => updateSub.mutate({ id: sub.id, status: sub.status === "active" ? "suspended" : "active" })}
                        className="grid size-6 shrink-0 place-items-center rounded-md text-om-muted hover:bg-white/[0.06] hover:text-om-text"
                      >
                        {sub.status === "active" ? <Pause className="size-3" /> : <Play className="size-3" />}
                      </button>
                      <button
                        title="Delete subdomain"
                        onClick={async () => {
                          if (
                            await confirm({
                              title: "Delete subdomain?",
                              message: (
                                <>
                                  <span className="font-mono text-om-text">{sub.subdomain}</span> will
                                  be permanently deleted.
                                </>
                              ),
                              confirmLabel: "Delete",
                              danger: true,
                            })
                          )
                            deleteSub.mutate(sub.id);
                        }}
                        className="grid size-6 shrink-0 place-items-center rounded-md text-om-muted hover:bg-om-red/10 hover:text-om-red"
                      >
                        <Trash2 className="size-3" />
                      </button>
                    </div>
                  ))
                )}
              </div>

              <OmButton
                variant="ghost"
                size="xs"
                className="mt-2.5"
                disabled={!org.owner_user_id}
                title={org.owner_user_id ? undefined : "Link a main account first"}
                onClick={() => setSubDialogOrg(org)}
              >
                <Plus /> Add subdomain
              </OmButton>
            </Card>
          ))}
        </div>
      )}

      <CreateOrganizationDialog open={createOrgOpen} onOpenChange={setCreateOrgOpen} />
      <CreateSubsidiaryDialog organization={subDialogOrg} onOpenChange={(v) => !v && setSubDialogOrg(null)} />
      {dialog}
    </div>
  );
}
