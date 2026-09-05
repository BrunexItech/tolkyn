"use client";

import { useState } from "react";
import {
  Mail,
  Phone,
  Users,
  Trash2,
  MessageSquarePlus,
  ChevronLeft,
  ChevronRight,
  Sparkle,
  Clock3,
} from "lucide-react";
import { Card } from "@/components/om/primitives/Card";
import { TableWrap } from "@/components/om/primitives/Table";
import { EmptyState } from "@/components/om/primitives/EmptyState";
import { OmButton } from "@/components/om/primitives/OmButton";
import { useConfirm } from "@/components/om/primitives/ConfirmDialog";
import { StageBadge } from "./StageBadge";
import { LogContactDialog } from "./LogContactDialog";
import { useCustomers, useDeleteCustomer } from "./hooks";
import type { Customer, CustomerFilters } from "@/lib/api/crm";
import { relativeTime, truncate } from "@/lib/om/format";
import { cn } from "@/lib/utils";

const STALE_DAYS = 30;
const isStale = (c: Customer) =>
  c.stage !== "churned" &&
  (!c.last_contact_at ||
    Date.now() - new Date(c.last_contact_at).getTime() > STALE_DAYS * 86400_000);

const SOURCE_LABEL: Record<string, string> = {
  lead: "From lead",
  manual: "Manual",
  referral: "Referral",
  import: "Import",
};

export function CustomersTable({
  filters,
  onChange,
  onSelect,
}: {
  filters: CustomerFilters;
  onChange: (patch: Partial<CustomerFilters>) => void;
  onSelect: (c: Customer) => void;
}) {
  const { data, isLoading, isError } = useCustomers(filters);
  const del = useDeleteCustomer();
  const { confirm, dialog } = useConfirm();
  const [logFor, setLogFor] = useState<Customer | null>(null);

  const limit = filters.limit ?? 25;
  const offset = filters.offset ?? 0;
  const total = data?.total ?? 0;

  const askDelete = async (c: Customer) => {
    const ok = await confirm({
      title: "Remove customer?",
      message: (
        <>
          <strong className="text-om-text">{c.name}</strong> will be permanently removed from the CRM.
        </>
      ),
      confirmLabel: "Remove",
      danger: true,
    });
    if (ok) del.mutate(c.id);
  };

  return (
    <Card noEdge className="p-0">
      {isLoading ? (
        <EmptyState title="Loading customers…" />
      ) : isError ? (
        <EmptyState icon={<Users />} title="Couldn’t load customers" />
      ) : !data || data.items.length === 0 ? (
        <EmptyState icon={<Users />} title="No customers yet">
          Push a lead to the CRM or add a customer manually.
        </EmptyState>
      ) : (
        <>
          <TableWrap>
            <table>
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Contact</th>
                  <th>Stage</th>
                  <th>MRR</th>
                  <th>Source</th>
                  <th>Last contact</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((c) => (
                  <tr key={c.id} onClick={() => onSelect(c)} className="cursor-pointer">
                    <td>
                      <div className="flex items-center gap-1.5 font-medium">
                        {c.name}
                        {c.source === "lead" && (
                          <Sparkle className="size-3 text-om-violet" aria-label="From lead" />
                        )}
                      </div>
                      {c.company && c.company !== c.name && (
                        <div className="text-[10px] text-om-muted">{c.company}</div>
                      )}
                    </td>
                    <td>
                      <div className="flex flex-col gap-0.5 text-[10.5px] text-om-dim">
                        {c.email && (
                          <span className="flex items-center gap-1">
                            <Mail className="size-3 text-om-muted" /> {truncate(c.email, 26)}
                          </span>
                        )}
                        {c.phone && (
                          <span className="flex items-center gap-1">
                            <Phone className="size-3 text-om-muted" /> {c.phone}
                          </span>
                        )}
                        {!c.email && !c.phone && <span className="text-om-faint">—</span>}
                      </div>
                    </td>
                    <td>
                      <StageBadge stage={c.stage} />
                    </td>
                    <td className="font-mono text-om-dim">
                      {c.monthly_value ? `$${c.monthly_value.toLocaleString()}` : "—"}
                    </td>
                    <td>
                      <span className="text-[10.5px] text-om-dim">
                        {SOURCE_LABEL[c.source] ?? c.source}
                      </span>
                    </td>
                    <td className="text-om-muted">
                      {c.last_contact_at ? (
                        <span
                          className={cn("inline-flex items-center gap-1", isStale(c) && "text-om-amber")}
                        >
                          {isStale(c) && <Clock3 className="size-3" />}
                          {relativeTime(c.last_contact_at)}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-om-amber">
                          <Clock3 className="size-3" /> never
                        </span>
                      )}
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => setLogFor(c)}
                          title="Log a contact"
                          className="grid size-7 place-items-center rounded-md text-om-muted hover:bg-om-blue/10 hover:text-om-blue"
                        >
                          <MessageSquarePlus className="size-3.5" />
                        </button>
                        <button
                          onClick={() => askDelete(c)}
                          title="Remove"
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
      {dialog}
      <LogContactDialog
        customerId={logFor?.id ?? null}
        customerName={logFor?.name}
        open={!!logFor}
        onOpenChange={(v) => !v && setLogFor(null)}
      />
    </Card>
  );
}
