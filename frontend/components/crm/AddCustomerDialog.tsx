"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Modal } from "@/components/om/primitives/Modal";
import { Field, OmInput } from "@/components/om/primitives/Field";
import { OmButton } from "@/components/om/primitives/OmButton";
import { useCreateCustomer } from "./hooks";
import type { CustomerStage } from "@/lib/api/crm";

const EMPTY = {
  name: "",
  company: "",
  email: "",
  phone: "",
  position: "",
  monthly_value: "",
  next_action: "",
  notes: "",
};

export function AddCustomerDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [form, setForm] = useState(EMPTY);
  const [stage, setStage] = useState<CustomerStage>("prospect");
  const create = useCreateCustomer();

  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = () => {
    if (!form.name.trim()) return;
    create.mutate(
      {
        name: form.name,
        company: form.company || undefined,
        email: form.email || undefined,
        phone: form.phone || undefined,
        position: form.position || undefined,
        monthly_value: form.monthly_value ? Number(form.monthly_value) : undefined,
        next_action: form.next_action || undefined,
        notes: form.notes || undefined,
        stage,
        source: "manual",
      },
      {
        onSuccess: () => {
          setForm(EMPTY);
          setStage("prospect");
          onOpenChange(false);
        },
      },
    );
  };

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Add customer"
      description="Track a customer or account directly in the CRM."
      footer={
        <>
          <OmButton variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </OmButton>
          <OmButton variant="solid" size="sm" onClick={submit} disabled={create.isPending || !form.name.trim()}>
            {create.isPending && <Loader2 className="animate-spin" />} Add customer
          </OmButton>
        </>
      }
    >
      <div className="space-y-1">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Name">
            <OmInput autoFocus value={form.name} onChange={set("name")} placeholder="Beatrix Kim" />
          </Field>
          <Field label="Company">
            <OmInput value={form.company} onChange={set("company")} placeholder="Northwind" />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Email">
            <OmInput type="email" value={form.email} onChange={set("email")} placeholder="bea@northwind.co" />
          </Field>
          <Field label="Phone">
            <OmInput value={form.phone} onChange={set("phone")} placeholder="+1 555 0100" />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Stage">
            <select
              value={stage}
              onChange={(e) => setStage(e.target.value as CustomerStage)}
              className="w-full rounded-lg border border-om-border bg-white/[0.03] px-2.5 py-2 text-[12.5px] text-om-text outline-none focus:border-om-blue/60"
            >
              <option value="lead">Lead</option>
              <option value="prospect">Prospect</option>
              <option value="trial">Trial</option>
              <option value="active">Active</option>
              <option value="churned">Churned</option>
            </select>
          </Field>
          <Field label="Monthly value">
            <OmInput type="number" value={form.monthly_value} onChange={set("monthly_value")} placeholder="0" />
          </Field>
        </div>
        <Field label="Next action">
          <OmInput value={form.next_action} onChange={set("next_action")} placeholder="Quarterly review" />
        </Field>
        <Field label="Notes">
          <textarea
            value={form.notes}
            onChange={set("notes")}
            rows={2}
            className="w-full rounded-lg border border-om-border bg-white/[0.03] px-2.5 py-2 text-[12.5px] text-om-text outline-none focus:border-om-blue/60"
          />
        </Field>
      </div>
    </Modal>
  );
}
