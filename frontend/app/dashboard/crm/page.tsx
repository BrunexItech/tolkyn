"use client";

import { useState } from "react";
import { Contact, Users, Radar } from "lucide-react";
import { SectionHeading } from "@/components/om/primitives/SectionHeading";
import { CrmStats } from "@/components/crm/CrmStats";
import { CrmPipeline } from "@/components/crm/CrmPipeline";
import { CrmToolbar } from "@/components/crm/CrmToolbar";
import { CustomersTable } from "@/components/crm/CustomersTable";
import { AddCustomerDialog } from "@/components/crm/AddCustomerDialog";
import { CustomerDetailDrawer } from "@/components/crm/CustomerDetailDrawer";
import { SocialLeadsPanel } from "@/components/crm/social-leads/SocialLeadsPanel";
import { useSocialLeadSummary } from "@/components/crm/social-leads/hooks";
import type { CustomerFilters } from "@/lib/api/crm";
import { cn } from "@/lib/utils";

type Tab = "customers" | "social";

export default function CrmPage() {
  const [tab, setTab] = useState<Tab>("customers");
  const [filters, setFilters] = useState<CustomerFilters>({ limit: 25, offset: 0 });
  const [addOpen, setAddOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: sl } = useSocialLeadSummary();
  const patch = (p: Partial<CustomerFilters>) => setFilters((f) => ({ ...f, ...p }));

  return (
    <div className="om-anim-rise space-y-3">
      <SectionHeading
        title="CRM"
        subtitle="Your customers, and the leads coming in from social"
        icon={<Contact />}
      />

      {/* tabs */}
      <div className="flex items-center gap-1 rounded-lg border border-om-border bg-white/[0.02] p-0.5">
        <button
          onClick={() => setTab("customers")}
          className={cn(
            "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-medium transition-colors",
            tab === "customers"
              ? "bg-white/[0.06] text-om-text"
              : "text-om-muted hover:text-om-dim",
          )}
        >
          <Users className="size-3.5" />
          Customers
        </button>
        <button
          onClick={() => setTab("social")}
          className={cn(
            "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-medium transition-colors",
            tab === "social"
              ? "bg-white/[0.06] text-om-text"
              : "text-om-muted hover:text-om-dim",
          )}
        >
          <Radar className="size-3.5" />
          Social Leads
          {sl && sl.new > 0 && (
            <span className="grid min-w-4 place-items-center rounded-full bg-om-violet px-1 text-[9.5px] font-bold text-white">
              {sl.new}
            </span>
          )}
        </button>
      </div>

      {tab === "customers" ? (
        <>
          <CrmStats />
          <CrmPipeline
            active={filters.stage}
            onPick={(stage) => patch({ stage, offset: 0 })}
          />
          <CrmToolbar filters={filters} onChange={patch} onAdd={() => setAddOpen(true)} />
          <CustomersTable
            filters={filters}
            onChange={patch}
            onSelect={(c) => setSelectedId(c.id)}
          />
          <AddCustomerDialog open={addOpen} onOpenChange={setAddOpen} />
          <CustomerDetailDrawer
            customerId={selectedId}
            onOpenChange={(v) => !v && setSelectedId(null)}
          />
        </>
      ) : (
        <SocialLeadsPanel />
      )}
    </div>
  );
}
