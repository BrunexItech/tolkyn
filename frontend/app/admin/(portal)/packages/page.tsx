"use client";

import { useState } from "react";
import { Package as PackageIcon, Plus, Pencil, Trash2, Users, Check } from "lucide-react";
import { SectionHeading } from "@/components/om/primitives/SectionHeading";
import { Card } from "@/components/om/primitives/Card";
import { EmptyState } from "@/components/om/primitives/EmptyState";
import { OmButton } from "@/components/om/primitives/OmButton";
import { StatusBadge } from "@/components/om/primitives/StatusBadge";
import { useConfirm } from "@/components/om/primitives/ConfirmDialog";
import { PackageDialog } from "@/components/admin/PackageDialog";
import { usePackages, useDeletePackage } from "@/components/admin/hooks";
import type { Package } from "@/lib/api/admin";

export default function AdminPackagesPage() {
  const { data, isLoading } = usePackages();
  const del = useDeletePackage();
  const { confirm, dialog } = useConfirm();
  const [editing, setEditing] = useState<Package | null>(null);
  const [creating, setCreating] = useState(false);

  const packages = data?.items ?? [];
  const modules = data?.modules ?? [];
  const moduleLabel = (k: string) => modules.find((m) => m.key === k)?.label ?? k;

  const onDelete = async (p: Package) => {
    const ok = await confirm({
      title: "Delete package?",
      message: `"${p.name}" will be removed. Users must be reassigned first.`,
      confirmLabel: "Delete",
      danger: true,
    });
    if (ok) del.mutate(p.id);
  };

  return (
    <div className="space-y-3">
      <SectionHeading
        title="Packages & pricing"
        subtitle="Define what each tier unlocks. Assign a package to a user in Users & rights."
        icon={<PackageIcon />}
        actions={
          <OmButton variant="solid" size="sm" onClick={() => setCreating(true)}>
            <Plus /> New package
          </OmButton>
        }
      />

      {isLoading ? (
        <EmptyState title="Loading…" />
      ) : packages.length === 0 ? (
        <EmptyState icon={<PackageIcon />} title="No packages yet">
          Create tiers like Starter, Growth and Enterprise, then assign them to users.
        </EmptyState>
      ) : (
        <div className="grid gap-2.5 lg:grid-cols-3">
          {packages.map((p) => (
            <Card key={p.id} className="flex flex-col gap-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-[14px] font-semibold">{p.name}</span>
                    {p.is_default && <StatusBadge tone="blue">Default</StatusBadge>}
                    {!p.is_active && <StatusBadge tone="muted">Inactive</StatusBadge>}
                  </div>
                  <div className="mt-0.5 text-[11px] text-om-muted">
                    {p.price_amount > 0
                      ? `${p.price_currency} ${p.price_amount.toLocaleString()} / ${p.price_interval}`
                      : "Custom / free"}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    onClick={() => setEditing(p)}
                    className="grid size-6 place-items-center rounded-md text-om-muted hover:bg-white/[0.06] hover:text-om-text"
                  >
                    <Pencil className="size-3" />
                  </button>
                  <button
                    onClick={() => onDelete(p)}
                    className="grid size-6 place-items-center rounded-md text-om-muted hover:bg-om-red/10 hover:text-om-red"
                  >
                    <Trash2 className="size-3" />
                  </button>
                </div>
              </div>

              {p.description && (
                <p className="line-clamp-2 text-[11px] leading-relaxed text-om-muted">{p.description}</p>
              )}

              <div className="flex items-center gap-1.5 text-[10.5px] text-om-faint">
                <Users className="size-3" />
                {p.member_count} user{p.member_count === 1 ? "" : "s"}
              </div>

              <div className="mt-auto flex flex-wrap gap-1 border-t border-om-border pt-2">
                {p.modules.includes("*") ? (
                  <span className="inline-flex items-center gap-1 rounded-md bg-om-green/12 px-1.5 py-0.5 text-[9.5px] font-semibold text-om-green">
                    <Check className="size-2.5" /> All modules
                  </span>
                ) : (
                  p.modules.map((m) => (
                    <span
                      key={m}
                      className="rounded-md border border-om-border bg-white/[0.02] px-1.5 py-0.5 text-[9.5px] text-om-muted"
                    >
                      {moduleLabel(m)}
                    </span>
                  ))
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      <PackageDialog pkg={null} modules={modules} open={creating} onOpenChange={setCreating} />
      <PackageDialog
        pkg={editing}
        modules={modules}
        open={!!editing}
        onOpenChange={(v) => !v && setEditing(null)}
      />
      {dialog}
    </div>
  );
}
