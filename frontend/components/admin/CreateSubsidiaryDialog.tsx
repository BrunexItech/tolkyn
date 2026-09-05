"use client";

import { useState, useEffect } from "react";
import { Loader2, Plus } from "lucide-react";
import { Modal } from "@/components/om/primitives/Modal";
import { Field, OmInput } from "@/components/om/primitives/Field";
import { OmButton } from "@/components/om/primitives/OmButton";
import { useCreateSubsidiary, useApprovedUsers } from "./hooks";
import type { Organization } from "@/lib/api/admin";

const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

export function CreateSubsidiaryDialog({
  organization,
  onOpenChange,
}: {
  organization: Organization | null;
  onOpenChange: (v: boolean) => void;
}) {
  const [name, setName] = useState("");
  const [subdomain, setSubdomain] = useState("");
  const [workspaceId, setWorkspaceId] = useState("");
  const create = useCreateSubsidiary();
  const { data: approvedUsers, isLoading: usersLoading } = useApprovedUsers();

  useEffect(() => {
    if (organization) {
      setName("");
      setSubdomain("");
      setWorkspaceId(organization.owner_user_id ?? "");
    }
  }, [organization?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const blocked = !!organization && !organization.owner_user_id;

  const submit = () => {
    if (!organization || !name.trim() || !subdomain.trim() || !workspaceId) return;
    create.mutate(
      {
        organization_id: organization.id,
        name: name.trim(),
        subdomain: slugify(subdomain),
        workspace_id: workspaceId,
      },
      { onSuccess: () => onOpenChange(false) },
    );
  };

  return (
    <Modal
      open={!!organization}
      onOpenChange={onOpenChange}
      title={organization ? `New subdomain for ${organization.name}` : "New subdomain"}
      description="Only the control room can create a subdomain — tenants can't self-serve this."
      footer={
        <>
          <OmButton variant="ghost" size="sm" onClick={() => onOpenChange(false)}>Cancel</OmButton>
          <OmButton
            variant="solid"
            size="sm"
            onClick={submit}
            disabled={create.isPending || blocked || !name.trim() || !subdomain.trim() || !workspaceId}
          >
            {create.isPending ? <Loader2 className="animate-spin" /> : <Plus />}
            Create
          </OmButton>
        </>
      }
    >
      {blocked ? (
        <p className="rounded-md border border-om-amber/25 bg-om-amber/[0.07] px-2.5 py-2 text-[12px] text-om-amber">
          {organization?.name} has no main account linked yet. Close this dialog, link an approved account to the
          organization first, then add a subdomain.
        </p>
      ) : (
        <div className="space-y-3">
          <Field label="Subsidiary name">
            <OmInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Acme Kenya" />
          </Field>
          <Field label="Subdomain" hint="acme-ke.tolkyn.co.ke">
            <OmInput value={subdomain} onChange={(e) => setSubdomain(slugify(e.target.value))} placeholder="acme-ke" />
          </Field>
          <Field label="Account this subdomain belongs to" hint="Only real, approved accounts — its activity is what shows up when the subdomain is visited">
            <select
              value={workspaceId}
              onChange={(e) => setWorkspaceId(e.target.value)}
              disabled={usersLoading}
              className="w-full rounded-lg border border-om-border bg-white/[0.03] px-2.5 py-2 text-[12px] text-om-text outline-none focus:border-om-violet/60"
            >
              <option value="">Select an account…</option>
              {approvedUsers?.items.map((u) => (
                <option key={u.id} value={u.id}>{u.name} — {u.email}</option>
              ))}
            </select>
          </Field>
        </div>
      )}
    </Modal>
  );
}
