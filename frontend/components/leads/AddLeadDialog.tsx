"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Modal } from "@/components/om/primitives/Modal";
import { Field, OmInput } from "@/components/om/primitives/Field";
import { OmButton } from "@/components/om/primitives/OmButton";
import { useCreateLead } from "./hooks";

const EMPTY = {
  name: "",
  company: "",
  email: "",
  phone: "",
  position: "",
  website_url: "",
  notes: "",
};

export function AddLeadDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [form, setForm] = useState(EMPTY);
  const create = useCreateLead();

  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = () => {
    if (!form.name.trim()) return;
    create.mutate(
      { ...form, source: "manual" },
      {
        onSuccess: () => {
          setForm(EMPTY);
          onOpenChange(false);
        },
      },
    );
  };

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Add lead"
      description="Manually add a prospect to your list."
      footer={
        <>
          <OmButton variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </OmButton>
          <OmButton variant="solid" size="sm" onClick={submit} disabled={create.isPending || !form.name.trim()}>
            {create.isPending && <Loader2 className="animate-spin" />} Add lead
          </OmButton>
        </>
      }
    >
      <div className="space-y-1">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Name / company">
            <OmInput autoFocus value={form.name} onChange={set("name")} placeholder="Jane Doe" />
          </Field>
          <Field label="Company">
            <OmInput value={form.company} onChange={set("company")} placeholder="Acme Inc." />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Email">
            <OmInput type="email" value={form.email} onChange={set("email")} placeholder="jane@acme.com" />
          </Field>
          <Field label="Phone">
            <OmInput value={form.phone} onChange={set("phone")} placeholder="+1 555 0100" />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Position">
            <OmInput value={form.position} onChange={set("position")} placeholder="Head of Growth" />
          </Field>
          <Field label="Website">
            <OmInput value={form.website_url} onChange={set("website_url")} placeholder="acme.com" />
          </Field>
        </div>
        <Field label="Notes">
          <textarea
            value={form.notes}
            onChange={set("notes")}
            rows={2}
            className="w-full rounded-lg border border-om-border bg-white/[0.03] px-2.5 py-2 text-[12.5px] text-om-text outline-none focus:border-om-blue/60"
            placeholder="Where did this lead come from?"
          />
        </Field>
      </div>
    </Modal>
  );
}
