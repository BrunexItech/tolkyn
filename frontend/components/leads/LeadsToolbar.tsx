"use client";

import { Search, Radar, Plus } from "lucide-react";
import { OmButton } from "@/components/om/primitives/OmButton";
import type { LeadFilters } from "@/lib/api/leads";

interface Props {
  filters: LeadFilters;
  onChange: (patch: Partial<LeadFilters>) => void;
  onGenerate: () => void;
  onAdd: () => void;
}

const SELECT_CLS =
  "rounded-lg border border-om-border bg-white/[0.03] px-2 py-1.5 text-[11.5px] text-om-dim outline-none focus:border-om-blue/60";

export function LeadsToolbar({ filters, onChange, onGenerate, onAdd }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-om-muted" />
        <input
          defaultValue={filters.search ?? ""}
          onChange={(e) => onChange({ search: e.target.value || undefined, offset: 0 })}
          placeholder="Search name, company, email"
          className="w-60 rounded-lg border border-om-border bg-white/[0.03] py-1.5 pl-8 pr-3 text-[12px] text-om-text outline-none placeholder:text-om-muted focus:border-om-blue/60 focus:ring-2 focus:ring-om-blue/15"
        />
      </div>

      <select
        className={SELECT_CLS}
        value={filters.score ?? ""}
        onChange={(e) => onChange({ score: (e.target.value || undefined) as LeadFilters["score"], offset: 0 })}
      >
        <option value="">All scores</option>
        <option value="hot">Hot</option>
        <option value="warm">Warm</option>
        <option value="cold">Cold</option>
        <option value="unknown">Unscored</option>
      </select>

      <select
        className={SELECT_CLS}
        value={filters.status ?? ""}
        onChange={(e) => onChange({ status: (e.target.value || undefined) as LeadFilters["status"], offset: 0 })}
      >
        <option value="">All statuses</option>
        <option value="new">New</option>
        <option value="contacted">Contacted</option>
        <option value="qualified">Qualified</option>
        <option value="proposal">Proposal</option>
        <option value="negotiation">Negotiation</option>
        <option value="closed_won">Closed won</option>
        <option value="closed_lost">Closed lost</option>
        <option value="unqualified">Unqualified</option>
      </select>

      <select
        className={SELECT_CLS}
        value={filters.source ?? ""}
        onChange={(e) => onChange({ source: (e.target.value || undefined) as LeadFilters["source"], offset: 0 })}
      >
        <option value="">All sources</option>
        <option value="website">Website</option>
        <option value="manual">Manual</option>
        <option value="scraped">Scraped</option>
        <option value="referral">Referral</option>
        <option value="linkedin">LinkedIn</option>
      </select>

      <div className="ml-auto flex items-center gap-2">
        <OmButton variant="outline" size="sm" onClick={onAdd}>
          <Plus /> Add lead
        </OmButton>
        <OmButton variant="solid" size="sm" onClick={onGenerate}>
          <Radar /> Find leads
        </OmButton>
      </div>
    </div>
  );
}
