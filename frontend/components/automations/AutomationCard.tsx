"use client";

import { useState } from "react";
import { Zap, ArrowRight, Play, Trash2, History, Loader2 } from "lucide-react";
import { Card } from "@/components/om/primitives/Card";
import { OmButton } from "@/components/om/primitives/OmButton";
import {
  useAutomationRuns,
  useDeleteAutomation,
  useTestAutomation,
  useToggleAutomation,
} from "./hooks";
import type { Automation } from "@/lib/api/automations";
import { relativeTime } from "@/lib/om/format";
import { cn } from "@/lib/utils";

const TRIGGER_LABEL: Record<string, string> = {
  new_lead: "New lead captured",
  new_comment: "New comment",
  new_mention: "Brand mentioned",
  inbound_message: "Inbound DM",
  post_published: "Post published",
  schedule: "On a schedule",
};
const ACTION_LABEL: Record<string, string> = {
  send_email: "Send an email",
  send_sms: "Send an SMS",
  add_tag: "Add a tag",
  push_to_crm: "Push to CRM",
  assign_teammate: "Assign a teammate",
  auto_reply: "Auto-reply",
  notify: "Notify me",
};

export function AutomationCard({ a }: { a: Automation }) {
  const toggle = useToggleAutomation();
  const test = useTestAutomation();
  const del = useDeleteAutomation();
  const [showRuns, setShowRuns] = useState(false);
  const { data: runs } = useAutomationRuns(showRuns ? a.id : null);

  return (
    <Card className={cn("space-y-2.5", !a.enabled && "opacity-60")}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-semibold tracking-tight">{a.name}</div>
          <div className="mt-0.5 text-[10px] text-om-muted">
            {a.runs_count} {a.runs_count === 1 ? "run" : "runs"}
            {a.last_run_at && ` · last ${relativeTime(a.last_run_at)}`}
          </div>
        </div>
        <button
          role="switch"
          aria-checked={a.enabled}
          onClick={() => toggle.mutate({ id: a.id, enabled: !a.enabled })}
          className={cn(
            "relative h-5 w-9 shrink-0 rounded-full transition-colors",
            a.enabled ? "bg-om-green" : "bg-white/[0.12]",
          )}
        >
          <span
            className={cn(
              "absolute top-0.5 size-4 rounded-full bg-white transition-transform",
              a.enabled ? "translate-x-[18px]" : "translate-x-0.5",
            )}
          />
        </button>
      </div>

      <div className="flex items-center gap-1.5 rounded-lg border border-om-border bg-white/[0.02] p-2 text-[11px]">
        <span className="flex items-center gap-1 text-om-blue">
          <Zap className="size-3" /> {TRIGGER_LABEL[a.trigger] ?? a.trigger}
        </span>
        <ArrowRight className="size-3 text-om-faint" />
        <span className="flex items-center gap-1 text-om-green">{ACTION_LABEL[a.action] ?? a.action}</span>
      </div>

      <div className="flex items-center gap-2">
        <OmButton variant="subtle" size="xs" onClick={() => test.mutate(a.id)} disabled={test.isPending}>
          {test.isPending ? <Loader2 className="animate-spin" /> : <Play />} Test run
        </OmButton>
        <OmButton variant="ghost" size="xs" onClick={() => setShowRuns((s) => !s)}>
          <History /> History
        </OmButton>
        <OmButton variant="ghost" size="xs" className="ml-auto" onClick={() => del.mutate(a.id)}>
          <Trash2 />
        </OmButton>
      </div>

      {showRuns && (
        <div className="om-scroll max-h-40 space-y-1 overflow-y-auto border-t border-om-border pt-2">
          {(runs?.items ?? []).length === 0 ? (
            <p className="text-[10.5px] text-om-muted">No runs yet.</p>
          ) : (
            (runs?.items ?? []).map((r) => (
              <div key={r.id} className="flex items-start gap-2 text-[10.5px]">
                <span
                  className={cn(
                    "mt-1 size-1.5 shrink-0 rounded-full",
                    r.status === "ok" ? "bg-om-green" : r.status === "error" ? "bg-om-red" : "bg-om-amber",
                  )}
                />
                <span className="flex-1 text-om-muted">{r.summary}</span>
                <span className="shrink-0 text-om-faint">{relativeTime(r.created_at)}</span>
              </div>
            ))
          )}
        </div>
      )}
    </Card>
  );
}
