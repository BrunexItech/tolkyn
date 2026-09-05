"use client";

import { useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { Modal } from "@/components/om/primitives/Modal";
import { Field, OmInput } from "@/components/om/primitives/Field";
import { OmButton } from "@/components/om/primitives/OmButton";
import { useCreateOrganization, useApprovedUsers } from "./hooks";

const slugify = (s: string) =>
  s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

export function CreateOrganizationDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [notes, setNotes] = useState("");
  const [ownerUserId, setOwnerUserId] = useState("");
  const create = useCreateOrganization();
  const { data: approvedUsers, isLoading: usersLoading } = useApprovedUsers();

  const effectiveSlug = slugTouched ? slug : slugify(name);

  const reset = () => {
    setName("");
    setSlug("");
    setSlugTouched(false);
    setNotes("");
    setOwnerUserId("");
  };

  const submit = () => {
    if (!name.trim() || !effectiveSlug) return;
    create.mutate(
      { name: name.trim(), slug: effectiveSlug, notes: notes.trim() || undefined, owner_user_id: ownerUserId || undefined },
      { onSuccess: () => { onOpenChange(false); reset(); } },
    );
  };

  return (
    <Modal
      open={open}
      onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}
      title="New organization"
      description="A tenant group the platform recognises. Subdomains can only be added once it has a real main account."
      footer={
        <>
          <OmButton variant="ghost" size="sm" onClick={() => onOpenChange(false)}>Cancel</OmButton>
          <OmButton variant="solid" size="sm" onClick={submit} disabled={create.isPending || !name.trim() || !effectiveSlug}>
            {create.isPending ? <Loader2 className="animate-spin" /> : <Plus />}
            Create
          </OmButton>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Organization name">
          <OmInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Acme Retail Group" />
        </Field>
        <Field label="Slug" hint="Identifies the organization internally">
          <OmInput
            value={effectiveSlug}
            onChange={(e) => { setSlug(slugify(e.target.value)); setSlugTouched(true); }}
            placeholder="acme-retail-group"
          />
        </Field>
        <Field label="Main account (optional)" hint="Only accounts the super admin has already approved can be linked">
          <select
            value={ownerUserId}
            onChange={(e) => setOwnerUserId(e.target.value)}
            disabled={usersLoading}
            className="w-full rounded-lg border border-om-border bg-white/[0.03] px-2.5 py-2 text-[12px] text-om-text outline-none focus:border-om-violet/60"
          >
            <option value="">No main account yet — link one later</option>
            {approvedUsers?.items.map((u) => (
              <option key={u.id} value={u.id}>{u.name} — {u.email}</option>
            ))}
          </select>
          {approvedUsers && approvedUsers.items.length === 0 && (
            <p className="mt-1 text-[10.5px] text-om-amber">No approved accounts yet — approve a user in Users &amp; Rights first.</p>
          )}
        </Field>
        <Field label="Notes (optional)">
          <OmInput value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Internal note" />
        </Field>
      </div>
    </Modal>
  );
}
