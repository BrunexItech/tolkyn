"use client";

import { useState } from "react";
import { Loader2, MapPin } from "lucide-react";
import { Modal } from "@/components/om/primitives/Modal";
import { Field, OmInput } from "@/components/om/primitives/Field";
import { OmButton } from "@/components/om/primitives/OmButton";
import { PlatformChip } from "@/components/om/primitives/PlatformChip";
import { PLATFORMS } from "@/lib/om/platforms";
import { useCreateCampaign } from "./hooks";
import { useAreas } from "@/components/geo/hooks";
import type { CampaignObjective } from "@/lib/api/campaigns";

const OBJECTIVES: CampaignObjective[] = ["awareness", "engagement", "leads", "traffic", "sales"];
const GOAL_METRICS = ["reach", "engagement", "leads", "clicks"];
const SELECT =
  "w-full rounded-lg border border-om-border bg-white/[0.03] px-2.5 py-2 text-[12.5px] text-om-text outline-none focus:border-om-blue/60";

export function CampaignDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const create = useCreateCampaign();
  const [form, setForm] = useState({
    name: "",
    objective: "awareness" as CampaignObjective,
    brief: "",
    budget: "",
    goal_metric: "reach",
    goal_target: "",
  });
  const [channels, setChannels] = useState<string[]>([]);
  const [areaIds, setAreaIds] = useState<string[]>([]);
  const { data: areasData } = useAreas();
  const areas = areasData?.items ?? [];

  const submit = () => {
    if (!form.name.trim()) return;
    create.mutate(
      {
        name: form.name.trim(),
        objective: form.objective,
        status: "active",
        brief: form.brief || undefined,
        channels,
        budget: form.budget ? Number(form.budget) : undefined,
        goal_metric: form.goal_metric,
        goal_target: form.goal_target ? Number(form.goal_target) : undefined,
        target_area_ids: areaIds,
      },
      {
        onSuccess: () => {
          setForm({ name: "", objective: "awareness", brief: "", budget: "", goal_metric: "reach", goal_target: "" });
          setChannels([]);
          setAreaIds([]);
          onOpenChange(false);
        },
      },
    );
  };

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="New campaign"
      description="Group posts under a goal and track results in one place."
      footer={
        <>
          <OmButton variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </OmButton>
          <OmButton variant="solid" size="sm" onClick={submit} disabled={create.isPending || !form.name.trim()}>
            {create.isPending && <Loader2 className="animate-spin" />} Create
          </OmButton>
        </>
      }
    >
      <div className="space-y-1">
        <Field label="Name">
          <OmInput autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Spring Launch" />
        </Field>
        <Field label="Objective">
          <select value={form.objective} onChange={(e) => setForm({ ...form, objective: e.target.value as CampaignObjective })} className={SELECT}>
            {OBJECTIVES.map((o) => (
              <option key={o} value={o} className="capitalize">
                {o}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Channels">
          <div className="flex flex-wrap gap-1.5">
            {PLATFORMS.map((p) => (
              <PlatformChip
                key={p.id}
                platform={p}
                active={channels.includes(p.id)}
                onClick={() =>
                  setChannels((c) => (c.includes(p.id) ? c.filter((x) => x !== p.id) : [...c, p.id]))
                }
                className={channels.includes(p.id) ? "" : "opacity-55"}
              />
            ))}
          </div>
        </Field>
        {areas.length > 0 && (
          <Field label="Target areas (optional)">
            <div className="flex flex-wrap gap-1.5">
              {areas.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() =>
                    setAreaIds((cur) => (cur.includes(a.id) ? cur.filter((x) => x !== a.id) : [...cur, a.id]))
                  }
                  className={`flex items-center gap-1 rounded-md border px-2 py-1 text-[10.5px] font-medium transition-colors ${
                    areaIds.includes(a.id)
                      ? "border-om-blue/40 bg-om-blue/15 text-om-blue"
                      : "border-om-border text-om-muted hover:text-om-dim"
                  }`}
                >
                  <MapPin className="size-3" />
                  {a.label}
                </button>
              ))}
            </div>
            <p className="mt-1 text-[10px] text-om-faint">
              Ties this campaign to areas from Geo Targeting — its reach estimate and messaging recipients can be
              scoped to them.
            </p>
          </Field>
        )}
        <Field label="Brief">
          <textarea
            value={form.brief}
            onChange={(e) => setForm({ ...form, brief: e.target.value })}
            rows={2}
            className={SELECT}
            placeholder="What's this campaign about?"
          />
        </Field>
        <div className="grid grid-cols-3 gap-2">
          <Field label="Budget">
            <OmInput type="number" value={form.budget} onChange={(e) => setForm({ ...form, budget: e.target.value })} placeholder="0" />
          </Field>
          <Field label="Goal metric">
            <select value={form.goal_metric} onChange={(e) => setForm({ ...form, goal_metric: e.target.value })} className={SELECT}>
              {GOAL_METRICS.map((m) => (
                <option key={m} className="capitalize">
                  {m}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Target">
            <OmInput type="number" value={form.goal_target} onChange={(e) => setForm({ ...form, goal_target: e.target.value })} placeholder="100000" />
          </Field>
        </div>
      </div>
    </Modal>
  );
}
