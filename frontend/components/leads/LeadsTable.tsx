"use client";

import {
  Mail,
  Phone,
  Globe,
  ArrowRightLeft,
  Trash2,
  Check,
  ChevronLeft,
  ChevronRight,
  MailCheck,
} from "lucide-react";
import { Card } from "@/components/om/primitives/Card";
import { TableWrap } from "@/components/om/primitives/Table";
import { StatusBadge } from "@/components/om/primitives/StatusBadge";
import { EmptyState } from "@/components/om/primitives/EmptyState";
import { OmButton } from "@/components/om/primitives/OmButton";
import { ScoreBadge } from "./ScoreBadge";
import { useLeads, useDeleteLead } from "./hooks";
import type { Lead, LeadFilters } from "@/lib/api/leads";
import { relativeTime, truncate } from "@/lib/om/format";
import { cn } from "@/lib/utils";

interface Props {
  filters: LeadFilters;
  onChange: (patch: Partial<LeadFilters>) => void;
  onSelect: (lead: Lead) => void;
  onConvert: (lead: Lead) => void;
  selected: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: (ids: string[]) => void;
}

export function LeadsTable({
  filters,
  onChange,
  onSelect,
  onConvert,
  selected,
  onToggle,
  onToggleAll,
}: Props) {
  const { data, isLoading, isError } = useLeads(filters);
  const del = useDeleteLead();
  const pageIds = data?.items.map((l) => l.id) ?? [];
  const allChecked = pageIds.length > 0 && pageIds.every((id) => selected.has(id));

  const limit = filters.limit ?? 25;
  const offset = filters.offset ?? 0;
  const total = data?.total ?? 0;

  return (
    <Card noEdge className="p-0">
      {isLoading ? (
        <EmptyState loading title="Loading leads…" />
      ) : isError ? (
        <EmptyState icon={<Globe />} title="Couldn’t load leads">
          Check that the API is running and you’re signed in.
        </EmptyState>
      ) : !data || data.items.length === 0 ? (
        <EmptyState icon={<Globe />} title="No leads yet">
          Generate leads from a website or add one manually to get started.
        </EmptyState>
      ) : (
        <>
          <TableWrap>
            <table>
              <thead>
                <tr>
                  <th className="w-8">
                    <input
                      type="checkbox"
                      checked={allChecked}
                      onChange={() => onToggleAll(pageIds)}
                      className="size-3.5 accent-om-blue"
                    />
                  </th>
                  <th>Lead</th>
                  <th>Contact</th>
                  <th>Score</th>
                  <th>Summary</th>
                  <th>Status</th>
                  <th>Added</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((lead) => (
                  <tr
                    key={lead.id}
                    onClick={() => onSelect(lead)}
                    className={cn("cursor-pointer", selected.has(lead.id) && "bg-om-blue/[0.04]")}
                  >
                    <td onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selected.has(lead.id)}
                        onChange={() => onToggle(lead.id)}
                        className="size-3.5 accent-om-blue"
                      />
                    </td>
                    <td>
                      <div className="font-medium">{lead.name}</div>
                      {lead.company && lead.company !== lead.name && (
                        <div className="text-[10px] text-om-muted">{lead.company}</div>
                      )}
                    </td>
                    <td>
                      <div className="flex flex-col gap-0.5 text-[10.5px] text-om-dim">
                        {lead.email && (
                          <span className="flex items-center gap-1">
                            <Mail className="size-3 text-om-muted" /> {truncate(lead.email, 24)}
                          </span>
                        )}
                        {lead.phone && (
                          <span className="flex items-center gap-1">
                            <Phone className="size-3 text-om-muted" /> {lead.phone}
                          </span>
                        )}
                        {lead.website_url && (
                          <span className="flex items-center gap-1 text-om-muted">
                            <Globe className="size-3" />{" "}
                            {truncate(lead.website_url.replace(/^https?:\/\//, ""), 24)}
                          </span>
                        )}
                        {!lead.email && !lead.phone && !lead.website_url && (
                          <span className="text-om-faint">—</span>
                        )}
                      </div>
                    </td>
                    <td>
                      <ScoreBadge score={lead.score} confidence={lead.ai_confidence_score} />
                    </td>
                    <td className="max-w-[240px] text-[10.5px] text-om-muted">
                      {lead.ai_summary ? truncate(lead.ai_summary, 90) : "—"}
                    </td>
                    <td>
                      <div className="flex items-center gap-1">
                        {lead.outreach_sent_at ? (
                          <MailCheck className="size-3.5 text-om-green" aria-label="Outreach sent" />
                        ) : lead.has_outreach ? (
                          <MailCheck className="size-3.5 text-om-blue" aria-label="Outreach drafted" />
                        ) : null}
                        <StatusBadge
                          tone={
                            lead.converted_customer_id
                              ? "green"
                              : lead.status === "new"
                                ? "blue"
                                : "muted"
                          }
                        >
                          {lead.converted_customer_id ? "In CRM" : lead.status.replace("_", " ")}
                        </StatusBadge>
                      </div>
                    </td>
                    <td className="text-om-muted">{relativeTime(lead.created_at)}</td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1">
                        {lead.converted_customer_id ? (
                          <span className="flex items-center gap-1 text-[10.5px] text-om-green">
                            <Check className="size-3" /> Pushed
                          </span>
                        ) : (
                          <button
                            onClick={() => onConvert(lead)}
                            title="Push to CRM"
                            className="grid size-7 place-items-center rounded-md text-om-muted hover:bg-om-blue/10 hover:text-om-blue"
                          >
                            <ArrowRightLeft className="size-3.5" />
                          </button>
                        )}
                        <button
                          onClick={() => del.mutate(lead.id)}
                          title="Delete"
                          className="grid size-7 place-items-center rounded-md text-om-muted hover:bg-om-red/10 hover:text-om-red"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>

          <div className="flex items-center justify-between border-t border-om-border px-3 py-2 text-[11px] text-om-muted">
            <span>
              {offset + 1}–{Math.min(offset + limit, total)} of {total}
            </span>
            <div className="flex gap-1">
              <OmButton
                variant="ghost"
                size="xs"
                disabled={offset === 0}
                onClick={() => onChange({ offset: Math.max(0, offset - limit) })}
              >
                <ChevronLeft /> Prev
              </OmButton>
              <OmButton
                variant="ghost"
                size="xs"
                disabled={offset + limit >= total}
                onClick={() => onChange({ offset: offset + limit })}
              >
                Next <ChevronRight />
              </OmButton>
            </div>
          </div>
        </>
      )}
    </Card>
  );
}
