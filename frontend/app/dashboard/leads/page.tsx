"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Target } from "lucide-react";
import { SectionHeading } from "@/components/om/primitives/SectionHeading";
import { LeadStats } from "@/components/leads/LeadStats";
import { LeadsToolbar } from "@/components/leads/LeadsToolbar";
import { LeadsTable } from "@/components/leads/LeadsTable";
import { BulkActionBar } from "@/components/leads/BulkActionBar";
import { GenerateLeadsDialog } from "@/components/leads/GenerateLeadsDialog";
import { AddLeadDialog } from "@/components/leads/AddLeadDialog";
import { LeadDetailDrawer } from "@/components/leads/LeadDetailDrawer";
import { ConvertLeadModal } from "@/components/leads/ConvertLeadModal";
import type { Lead, LeadFilters } from "@/lib/api/leads";

export default function LeadsPage() {
  return (
    <Suspense fallback={null}>
      <LeadsPageInner />
    </Suspense>
  );
}

function LeadsPageInner() {
  const deepLinkId = useSearchParams().get("lead");
  const [filters, setFilters] = useState<LeadFilters>({ limit: 25, offset: 0 });
  const [genOpen, setGenOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(deepLinkId);

  // Open the drawer when arrived at via ?lead=<id> (e.g. from global search),
  // including when already on this page.
  useEffect(() => {
    if (deepLinkId) setSelectedId(deepLinkId);
  }, [deepLinkId]);
  const [converting, setConverting] = useState<Lead | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const patch = (p: Partial<LeadFilters>) => setFilters((f) => ({ ...f, ...p }));

  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const toggleAll = (ids: string[]) =>
    setSelected((s) => {
      const allOn = ids.every((id) => s.has(id));
      const next = new Set(s);
      ids.forEach((id) => (allOn ? next.delete(id) : next.add(id)));
      return next;
    });

  return (
    <div className="om-anim-rise space-y-3">
      <SectionHeading
        title="Lead Generator"
        subtitle="Describe who you want — Tolkyn finds them, drafts the outreach, sends it, routes to CRM"
        icon={<Target />}
      />

      <LeadStats />

      <LeadsToolbar
        filters={filters}
        onChange={patch}
        onGenerate={() => setGenOpen(true)}
        onAdd={() => setAddOpen(true)}
      />

      <LeadsTable
        filters={filters}
        onChange={patch}
        onSelect={(l) => setSelectedId(l.id)}
        onConvert={(l) => setConverting(l)}
        selected={selected}
        onToggle={toggle}
        onToggleAll={toggleAll}
      />

      <BulkActionBar ids={[...selected]} onClear={() => setSelected(new Set())} />

      <GenerateLeadsDialog open={genOpen} onOpenChange={setGenOpen} />
      <AddLeadDialog open={addOpen} onOpenChange={setAddOpen} />
      <LeadDetailDrawer
        leadId={selectedId}
        onOpenChange={(v) => !v && setSelectedId(null)}
        onConvert={(l) => setConverting(l)}
      />
      <ConvertLeadModal
        lead={converting}
        onOpenChange={(v) => !v && setConverting(null)}
        onDone={() => setSelectedId(null)}
      />
    </div>
  );
}
