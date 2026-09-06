"use client";

import { useState } from "react";
import {
  Mail,
  Phone,
  Globe,
  Sparkles,
  Trash2,
  ArrowRightLeft,
  Check,
  Building2,
} from "lucide-react";
import { FaLinkedinIn } from "react-icons/fa6";
import { Drawer } from "@/components/om/primitives/Drawer";
import { LoadingState } from "@/components/om/primitives/Spinner";
import { OmButton } from "@/components/om/primitives/OmButton";
import { ScoreBadge } from "./ScoreBadge";
import { OutreachPanel } from "./OutreachPanel";
import { useLead, useUpdateLead, useDeleteLead } from "./hooks";
import type { Lead, LeadStatus } from "@/lib/api/leads";
import { shortDateTime } from "@/lib/om/format";

const STATUSES: LeadStatus[] = [
  "new", "contacted", "qualified", "proposal", "negotiation", "closed_won", "closed_lost", "unqualified",
];

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

export function LeadDetailDrawer({
  leadId,
  onOpenChange,
  onConvert,
}: {
  leadId: string | null;
  onOpenChange: (v: boolean) => void;
  onConvert: (lead: Lead) => void;
}) {
  const { data: lead } = useLead(leadId);
  const update = useUpdateLead();
  const del = useDeleteLead();
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <Drawer
      open={!!leadId}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) setConfirmDelete(false);
      }}
      title={lead?.name ?? "Lead"}
      subtitle={lead?.company ?? undefined}
      footer={
        lead ? (
          <>
            {lead.converted_customer_id ? (
              <span className="flex items-center gap-1 text-[11.5px] text-om-green">
                <Check className="size-3.5" /> In CRM
              </span>
            ) : (
              <OmButton variant="subtle" size="sm" onClick={() => onConvert(lead)}>
                <ArrowRightLeft /> Push to CRM
              </OmButton>
            )}
            <OmButton
              variant={confirmDelete ? "danger" : "ghost"}
              size="sm"
              className="ml-auto"
              onClick={() => {
                if (confirmDelete) {
                  del.mutate(lead.id, { onSuccess: () => onOpenChange(false) });
                } else setConfirmDelete(true);
              }}
            >
              <Trash2 /> {confirmDelete ? "Confirm delete" : "Delete"}
            </OmButton>
          </>
        ) : null
      }
    >
      {!lead ? (
        <LoadingState />
      ) : (
        <>
          <div className="flex items-center gap-2">
            <ScoreBadge score={lead.score} confidence={lead.ai_confidence_score} />
            {lead.seniority && lead.seniority !== "unknown" && (
              <span className="rounded-md border border-om-border bg-white/[0.03] px-1.5 py-0.5 text-[10px] text-om-muted">
                {lead.seniority}
              </span>
            )}
          </div>

          <div>
            <SectionLabel>Contact</SectionLabel>
            <div className="space-y-1.5">
              {lead.email ? (
                <Row icon={<Mail />}>
                  <a href={`mailto:${lead.email}`} className="hover:text-om-blue">
                    {lead.email}
                  </a>
                </Row>
              ) : null}
              {lead.phone ? <Row icon={<Phone />}>{lead.phone}</Row> : null}
              {lead.position ? <Row icon={<Building2 />}>{lead.position}</Row> : null}
              {lead.website_url ? (
                <Row icon={<Globe />}>
                  <a
                    href={lead.website_url}
                    target="_blank"
                    rel="noreferrer"
                    className="truncate hover:text-om-blue"
                  >
                    {lead.website_url}
                  </a>
                </Row>
              ) : null}
              {lead.linkedin_url ? (
                <Row icon={<FaLinkedinIn />}>
                  <a href={lead.linkedin_url} target="_blank" rel="noreferrer" className="hover:text-om-blue">
                    LinkedIn
                  </a>
                </Row>
              ) : null}
              {!lead.email && !lead.phone && !lead.website_url && (
                <div className="text-[11.5px] text-om-muted">No public contact details captured.</div>
              )}
            </div>
          </div>

          {(lead.ai_summary || lead.ai_recommendation || (lead.ai_intent_signals?.length ?? 0) > 0) && (
            <div className="rounded-lg border border-om-border bg-white/[0.02] p-3">
              <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold text-om-blue">
                <Sparkles className="size-3.5" /> AI assessment
              </div>
              {lead.ai_summary && (
                <p className="text-[12px] leading-relaxed text-om-dim">{lead.ai_summary}</p>
              )}
              {lead.ai_recommendation && (
                <p className="mt-2 text-[11.5px] leading-relaxed text-om-muted">
                  <span className="font-semibold text-om-dim">Recommended: </span>
                  {lead.ai_recommendation}
                </p>
              )}
              {lead.outreach_angle && lead.outreach_angle !== lead.ai_recommendation && (
                <p className="mt-1.5 text-[11.5px] leading-relaxed text-om-muted">
                  <span className="font-semibold text-om-dim">Angle: </span>
                  {lead.outreach_angle}
                </p>
              )}
              {(lead.ai_intent_signals?.length ?? 0) > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {lead.ai_intent_signals!.map((sig, i) => (
                    <span
                      key={i}
                      className="rounded-md bg-om-blue/10 px-1.5 py-0.5 text-[10px] text-om-blue"
                    >
                      {sig}
                    </span>
                  ))}
                </div>
              )}
              {lead.key_facts.length > 0 && (
                <ul className="mt-2 space-y-0.5">
                  {lead.key_facts.map((f, i) => (
                    <li key={i} className="flex gap-1.5 text-[11px] text-om-muted">
                      <span className="text-om-faint">·</span>
                      {f}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <OutreachPanel lead={lead} />

          <div>
            <SectionLabel>Pipeline status</SectionLabel>
            <select
              value={lead.status}
              onChange={(e) => update.mutate({ id: lead.id, status: e.target.value as LeadStatus })}
              className="w-full rounded-lg border border-om-border bg-white/[0.03] px-2.5 py-2 text-[12px] text-om-text outline-none focus:border-om-blue/60"
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s.replace("_", " ")}
                </option>
              ))}
            </select>
          </div>

          {lead.tags.length > 0 && (
            <div>
              <SectionLabel>Tags</SectionLabel>
              <div className="flex flex-wrap gap-1">
                {lead.tags.map((t) => (
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

          {lead.notes && (
            <div>
              <SectionLabel>Notes</SectionLabel>
              <p className="text-[11.5px] leading-relaxed text-om-dim">{lead.notes}</p>
            </div>
          )}

          <div className="text-[10.5px] text-om-faint">
            Source: {lead.source} · Added {shortDateTime(lead.created_at)}
          </div>
        </>
      )}
    </Drawer>
  );
}
