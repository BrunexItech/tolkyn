"use client";

import { useState } from "react";
import { Workflow, Plus, Zap, Activity } from "lucide-react";
import { SectionHeading } from "@/components/om/primitives/SectionHeading";
import { Grid } from "@/components/om/primitives/Grid";
import { StatTile } from "@/components/om/primitives/StatTile";
import { Card } from "@/components/om/primitives/Card";
import { EmptyState } from "@/components/om/primitives/EmptyState";
import { OmButton } from "@/components/om/primitives/OmButton";
import { AutomationDialog } from "@/components/automations/AutomationDialog";
import { AutomationCard } from "@/components/automations/AutomationCard";
import { useAutomations, useAutomationSummary } from "@/components/automations/hooks";
import { compact } from "@/lib/om/format";

export default function AutomationsPage() {
  const { data } = useAutomations();
  const { data: summary } = useAutomationSummary();
  const [open, setOpen] = useState(false);
  const items = data?.items ?? [];

  return (
    <div className="om-anim-rise space-y-3">
      <SectionHeading
        title="Automations"
        subtitle="Turn repeatable work into rules — a trigger fires, an action runs"
        icon={<Workflow />}
        actions={
          <OmButton variant="solid" size="sm" onClick={() => setOpen(true)}>
            <Plus /> New automation
          </OmButton>
        }
      />

      <Grid cols={4}>
        <StatTile label="Automations" value={summary?.total ?? "—"} icon={<Workflow />} color="var(--om-blue)" />
        <StatTile label="Active" value={summary?.active ?? "—"} icon={<Zap />} color="var(--om-green)" />
        <StatTile label="Total runs" value={summary ? compact(summary.runs_total) : "—"} icon={<Activity />} color="var(--om-violet)" />
        <StatTile label="Idle" value={summary ? summary.total - summary.active : "—"} icon={<Workflow />} color="var(--om-amber)" />
      </Grid>

      {items.length === 0 ? (
        <Card>
          <EmptyState icon={<Workflow />} title="No automations yet">
            Create a rule like “when a new lead is captured, add a tag and send a welcome email”.
          </EmptyState>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((a) => (
            <AutomationCard key={a.id} a={a} />
          ))}
        </div>
      )}

      <AutomationDialog open={open} onOpenChange={setOpen} />
    </div>
  );
}
