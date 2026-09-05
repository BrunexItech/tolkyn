"use client";

import { useState } from "react";
import { Loader2, ArrowRightLeft } from "lucide-react";
import { Modal } from "@/components/om/primitives/Modal";
import { Field, OmInput } from "@/components/om/primitives/Field";
import { OmButton } from "@/components/om/primitives/OmButton";
import { useConvertLead } from "./hooks";
import type { Lead } from "@/lib/api/leads";

export function ConvertLeadModal({
  lead,
  onOpenChange,
  onDone,
}: {
  lead: Lead | null;
  onOpenChange: (v: boolean) => void;
  onDone?: () => void;
}) {
  const [stage, setStage] = useState("prospect");
  const [mrr, setMrr] = useState("");
  const [nextAction, setNextAction] = useState("");
  const convert = useConvertLead();

  const submit = () => {
    if (!lead) return;
    convert.mutate(
      {
        id: lead.id,
        stage,
        monthly_value: mrr ? Number(mrr) : undefined,
        next_action: nextAction || undefined,
      },
      {
        onSuccess: () => {
          onOpenChange(false);
          onDone?.();
        },
      },
    );
  };

  return (
    <Modal
      open={!!lead}
      onOpenChange={onOpenChange}
      title="Push to CRM"
      description={lead ? `Create a customer record for ${lead.name}.` : ""}
      footer={
        <>
          <OmButton variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </OmButton>
          <OmButton variant="solid" size="sm" onClick={submit} disabled={convert.isPending}>
            {convert.isPending ? <Loader2 className="animate-spin" /> : <ArrowRightLeft />}
            Convert
          </OmButton>
        </>
      }
    >
      <div className="space-y-1">
        <Field label="Stage">
          <select
            value={stage}
            onChange={(e) => setStage(e.target.value)}
            className="w-full rounded-lg border border-om-border bg-white/[0.03] px-2.5 py-2 text-[12.5px] text-om-text outline-none focus:border-om-blue/60"
          >
            <option value="lead">Lead</option>
            <option value="prospect">Prospect</option>
            <option value="trial">Trial</option>
            <option value="active">Active</option>
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Monthly value">
            <OmInput
              type="number"
              value={mrr}
              onChange={(e) => setMrr(e.target.value)}
              placeholder="0"
            />
          </Field>
          <Field label="Next action">
            <OmInput
              value={nextAction}
              onChange={(e) => setNextAction(e.target.value)}
              placeholder="Kickoff call"
            />
          </Field>
        </div>
      </div>
    </Modal>
  );
}
