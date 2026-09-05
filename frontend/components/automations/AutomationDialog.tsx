"use client";

import { useMemo, useState } from "react";
import { Loader2, Zap, ArrowRight } from "lucide-react";
import { Modal } from "@/components/om/primitives/Modal";
import { Field, OmInput } from "@/components/om/primitives/Field";
import { OmButton } from "@/components/om/primitives/OmButton";
import { useAutomationSummary, useCreateAutomation } from "./hooks";
import type { AutomationAction, AutomationTrigger } from "@/lib/api/automations";

const SELECT =
  "w-full rounded-lg border border-om-border bg-white/[0.03] px-2.5 py-2 text-[12.5px] text-om-text outline-none focus:border-om-blue/60";

const FIELD_LABEL: Record<string, string> = {
  min_score: "Minimum lead score",
  platform: "Platform",
  keyword: "Keyword contains",
  cadence: "Cadence",
  template: "Message / template",
  tag: "Tag to add",
  assignee: "Assign to (email)",
  channel: "Notify via",
};

export function AutomationDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { data: summary } = useAutomationSummary();
  const create = useCreateAutomation();

  const [name, setName] = useState("");
  const [trigger, setTrigger] = useState<AutomationTrigger>("new_lead");
  const [action, setAction] = useState<AutomationAction>("add_tag");
  const [triggerCfg, setTriggerCfg] = useState<Record<string, string>>({});
  const [actionCfg, setActionCfg] = useState<Record<string, string>>({});

  const triggers = summary?.triggers ?? [];
  const actions = summary?.actions ?? [];
  const triggerFields = useMemo(
    () => triggers.find((t) => t.id === trigger)?.fields ?? [],
    [triggers, trigger],
  );
  const actionFields = useMemo(
    () => actions.find((a) => a.id === action)?.fields ?? [],
    [actions, action],
  );

  const reset = () => {
    setName("");
    setTrigger("new_lead");
    setAction("add_tag");
    setTriggerCfg({});
    setActionCfg({});
  };

  const submit = () => {
    if (!name.trim()) return;
    create.mutate(
      {
        name: name.trim(),
        trigger,
        action,
        trigger_config: triggerCfg,
        action_config: actionCfg,
        enabled: true,
      },
      {
        onSuccess: () => {
          reset();
          onOpenChange(false);
        },
      },
    );
  };

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="New automation"
      description="When something happens, run an action automatically."
      footer={
        <>
          <OmButton variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </OmButton>
          <OmButton variant="solid" size="sm" onClick={submit} disabled={create.isPending || !name.trim()}>
            {create.isPending && <Loader2 className="animate-spin" />} Create
          </OmButton>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Name">
          <OmInput autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Welcome new leads" />
        </Field>

        <div className="rounded-lg border border-om-border bg-white/[0.02] p-3">
          <div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-om-blue">
            <Zap className="size-3" /> When
          </div>
          <select value={trigger} onChange={(e) => { setTrigger(e.target.value as AutomationTrigger); setTriggerCfg({}); }} className={SELECT}>
            {triggers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
          {triggerFields.map((f) => (
            <div key={f} className="mt-2">
              <label className="mb-1 block text-[10px] text-om-muted">{FIELD_LABEL[f] ?? f}</label>
              <OmInput
                value={triggerCfg[f] ?? ""}
                onChange={(e) => setTriggerCfg({ ...triggerCfg, [f]: e.target.value })}
              />
            </div>
          ))}
        </div>

        <div className="flex justify-center">
          <ArrowRight className="size-4 text-om-faint" />
        </div>

        <div className="rounded-lg border border-om-border bg-white/[0.02] p-3">
          <div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-om-green">
            <ArrowRight className="size-3" /> Then
          </div>
          <select value={action} onChange={(e) => { setAction(e.target.value as AutomationAction); setActionCfg({}); }} className={SELECT}>
            {actions.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
          {actionFields.map((f) =>
            f === "template" ? (
              <textarea
                key={f}
                value={actionCfg[f] ?? ""}
                onChange={(e) => setActionCfg({ ...actionCfg, [f]: e.target.value })}
                rows={3}
                placeholder="Message body…"
                className={`mt-2 ${SELECT}`}
              />
            ) : (
              <div key={f} className="mt-2">
                <label className="mb-1 block text-[10px] text-om-muted">{FIELD_LABEL[f] ?? f}</label>
                <OmInput
                  value={actionCfg[f] ?? ""}
                  onChange={(e) => setActionCfg({ ...actionCfg, [f]: e.target.value })}
                />
              </div>
            ),
          )}
        </div>
      </div>
    </Modal>
  );
}
