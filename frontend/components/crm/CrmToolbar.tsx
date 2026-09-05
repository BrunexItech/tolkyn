"use client";

import { Search, Plus, Clock3 } from "lucide-react";
import { OmButton } from "@/components/om/primitives/OmButton";
import { cn } from "@/lib/utils";
import type { CustomerFilters } from "@/lib/api/crm";

export function CrmToolbar({
  filters,
  onChange,
  onAdd,
}: {
  filters: CustomerFilters;
  onChange: (patch: Partial<CustomerFilters>) => void;
  onAdd: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-om-muted" />
        <input
          defaultValue={filters.search ?? ""}
          onChange={(e) => onChange({ search: e.target.value || undefined, offset: 0 })}
          placeholder="Search customers"
          className="w-60 rounded-lg border border-om-border bg-white/[0.03] py-1.5 pl-8 pr-3 text-[12px] text-om-text outline-none placeholder:text-om-muted focus:border-om-blue/60 focus:ring-2 focus:ring-om-blue/15"
        />
      </div>

      <select
        className="rounded-lg border border-om-border bg-white/[0.03] px-2 py-1.5 text-[11.5px] text-om-dim outline-none focus:border-om-blue/60"
        value={filters.stage ?? ""}
        onChange={(e) => onChange({ stage: (e.target.value || undefined) as CustomerFilters["stage"], offset: 0 })}
      >
        <option value="">All stages</option>
        <option value="lead">Lead</option>
        <option value="prospect">Prospect</option>
        <option value="trial">Trial</option>
        <option value="active">Active</option>
        <option value="churned">Churned</option>
      </select>

      <select
        className="rounded-lg border border-om-border bg-white/[0.03] px-2 py-1.5 text-[11.5px] text-om-dim outline-none focus:border-om-blue/60"
        value={filters.source ?? ""}
        onChange={(e) => onChange({ source: (e.target.value || undefined) as CustomerFilters["source"], offset: 0 })}
      >
        <option value="">All sources</option>
        <option value="lead">From lead</option>
        <option value="manual">Manual</option>
        <option value="referral">Referral</option>
        <option value="import">Import</option>
      </select>

      <button
        onClick={() =>
          onChange({
            not_contacted_days: filters.not_contacted_days ? undefined : 30,
            offset: 0,
          })
        }
        className={cn(
          "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11.5px] font-medium transition-colors",
          filters.not_contacted_days
            ? "border-om-amber/50 bg-om-amber/10 text-om-amber"
            : "border-om-border text-om-muted hover:text-om-dim",
        )}
      >
        <Clock3 className="size-3.5" /> Needs follow-up
      </button>

      <OmButton variant="solid" size="sm" className="ml-auto" onClick={onAdd}>
        <Plus /> Add customer
      </OmButton>
    </div>
  );
}
