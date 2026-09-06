"use client";

import { useState } from "react";
import {
  Mail,
  Phone,
  Globe,
  Building2,
  Sparkles,
  Trash2,
  MessageSquarePlus,
  Sparkle,
} from "lucide-react";
import { FaLinkedinIn } from "react-icons/fa6";
import { Drawer } from "@/components/om/primitives/Drawer";
import { LoadingState } from "@/components/om/primitives/Spinner";
import { OmButton } from "@/components/om/primitives/OmButton";
import { OmInput } from "@/components/om/primitives/Field";
import { StageBadge } from "./StageBadge";
import { InteractionTimeline } from "./InteractionTimeline";
import { LogContactDialog } from "./LogContactDialog";
import { useCustomer, useUpdateCustomer, useDeleteCustomer } from "./hooks";
import type { CustomerStage } from "@/lib/api/crm";
import { shortDateTime } from "@/lib/om/format";

const STAGES: CustomerStage[] = ["lead", "prospect", "trial", "active", "churned"];

function Row({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-[12px] text-om-dim">
      <span className="text-om-muted [&_svg]:size-3.5">{icon}</span>
      {children}
    </div>
  );
}
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-om-faint">
      {children}
    </div>
  );
}

export function CustomerDetailDrawer({
  customerId,
  onOpenChange,
}: {
  customerId: string | null;
  onOpenChange: (v: boolean) => void;
}) {
  const { data: c } = useCustomer(customerId);
  const update = useUpdateCustomer();
  const del = useDeleteCustomer();
  const [logOpen, setLogOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [mrr, setMrr] = useState<string>("");
  const [mrrDirty, setMrrDirty] = useState(false);

  const currentMrr = mrrDirty ? mrr : c?.monthly_value != null ? String(c.monthly_value) : "";

  return (
    <>
    <Drawer
      open={!!customerId}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) {
          setConfirmDelete(false);
          setMrrDirty(false);
        }
      }}
      title={c?.name ?? "Customer"}
      subtitle={c?.company ?? undefined}
      footer={
        c ? (
          <>
            <OmButton variant="subtle" size="sm" onClick={() => setLogOpen(true)}>
              <MessageSquarePlus /> Log contact
            </OmButton>
            <OmButton
              variant={confirmDelete ? "danger" : "ghost"}
              size="sm"
              className="ml-auto"
              onClick={() => {
                if (confirmDelete) del.mutate(c.id, { onSuccess: () => onOpenChange(false) });
                else setConfirmDelete(true);
              }}
            >
              <Trash2 /> {confirmDelete ? "Confirm" : "Remove"}
            </OmButton>
          </>
        ) : null
      }
    >
      {!c ? (
        <LoadingState />
      ) : (
        <>
          <div className="flex items-center gap-2">
            <StageBadge stage={c.stage} />
            {c.source === "lead" && (
              <span className="flex items-center gap-1 rounded-md border border-om-violet/25 bg-om-violet/10 px-1.5 py-0.5 text-[10px] text-om-violet">
                <Sparkle className="size-2.5" /> From lead
              </span>
            )}
          </div>

          <div>
            <SectionLabel>Contact</SectionLabel>
            <div className="space-y-1.5">
              {c.email && (
                <Row icon={<Mail />}>
                  <a href={`mailto:${c.email}`} className="hover:text-om-blue">
                    {c.email}
                  </a>
                </Row>
              )}
              {c.phone && (
                <Row icon={<Phone />}>
                  <a href={`tel:${c.phone.replace(/[\s()-]/g, "")}`} className="font-mono hover:text-om-blue">
                    {c.phone}
                  </a>
                </Row>
              )}
              {c.position && <Row icon={<Building2 />}>{c.position}</Row>}
              {c.website_url && (
                <Row icon={<Globe />}>
                  <a href={c.website_url} target="_blank" rel="noreferrer" className="truncate hover:text-om-blue">
                    {c.website_url}
                  </a>
                </Row>
              )}
              {c.linkedin_url && (
                <Row icon={<FaLinkedinIn />}>
                  <a href={c.linkedin_url} target="_blank" rel="noreferrer" className="hover:text-om-blue">
                    LinkedIn
                  </a>
                </Row>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <SectionLabel>Stage</SectionLabel>
              <select
                value={c.stage}
                onChange={(e) => update.mutate({ id: c.id, stage: e.target.value as CustomerStage })}
                className="w-full rounded-lg border border-om-border bg-white/[0.03] px-2.5 py-2 text-[12px] text-om-text outline-none focus:border-om-blue/60"
              >
                {STAGES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <SectionLabel>Monthly value</SectionLabel>
              <OmInput
                type="number"
                value={currentMrr}
                onChange={(e) => {
                  setMrr(e.target.value);
                  setMrrDirty(true);
                }}
                onBlur={() => {
                  if (mrrDirty) {
                    update.mutate({ id: c.id, monthly_value: currentMrr ? Number(currentMrr) : 0 });
                    setMrrDirty(false);
                  }
                }}
              />
            </div>
          </div>

          {c.next_action && (
            <div>
              <SectionLabel>Next action</SectionLabel>
              <p className="text-[12px] text-om-dim">{c.next_action}</p>
            </div>
          )}

          <InteractionTimeline customerId={c.id} lastContactAt={c.last_contact_at} />

          {(c.ai_summary || c.ai_recommendation) && (
            <div className="rounded-lg border border-om-border bg-white/[0.02] p-3">
              <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold text-om-blue">
                <Sparkles className="size-3.5" /> Carried over from the lead
              </div>
              {c.ai_summary && (
                <p className="text-[12px] leading-relaxed text-om-dim">{c.ai_summary}</p>
              )}
              {c.ai_recommendation && (
                <p className="mt-1.5 text-[11.5px] leading-relaxed text-om-muted">{c.ai_recommendation}</p>
              )}
            </div>
          )}

          {c.tags.length > 0 && (
            <div>
              <SectionLabel>Tags</SectionLabel>
              <div className="flex flex-wrap gap-1">
                {c.tags.map((t) => (
                  <span
                    key={t}
                    className="rounded-md border border-om-border bg-white/[0.03] px-1.5 py-0.5 text-[10.5px] text-om-muted"
                  >
                    {t}
                  </span>
                ))}
              </div>
            </div>
          )}

          {c.notes && (
            <div>
              <SectionLabel>Notes</SectionLabel>
              <p className="om-selectable text-[11.5px] leading-relaxed text-om-dim">{c.notes}</p>
            </div>
          )}

          <div className="text-[10.5px] text-om-faint">
            Added {shortDateTime(c.created_at)}
            {c.last_contact_at ? ` · last contact ${shortDateTime(c.last_contact_at)}` : ""}
          </div>
        </>
      )}
    </Drawer>
    <LogContactDialog
      customerId={customerId}
      customerName={c?.name}
      open={logOpen}
      onOpenChange={setLogOpen}
    />
    </>
  );
}
