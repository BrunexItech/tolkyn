"use client";

import { Card } from "@/components/om/primitives/Card";
import { useCustomerSummary } from "./hooks";
import type { CustomerStage } from "@/lib/api/crm";

const STAGES: { id: CustomerStage; label: string; color: string }[] = [
  { id: "lead", label: "Lead", color: "var(--om-muted)" },
  { id: "prospect", label: "Prospect", color: "var(--om-blue)" },
  { id: "trial", label: "Trial", color: "var(--om-amber)" },
  { id: "active", label: "Active", color: "var(--om-green)" },
  { id: "churned", label: "Churned", color: "var(--om-red)" },
];

export function CrmPipeline({
  onPick,
  active,
}: {
  onPick?: (stage?: CustomerStage) => void;
  active?: CustomerStage;
}) {
  const { data: s } = useCustomerSummary();
  if (!s) return null;

  const total = STAGES.reduce((n, st) => n + (s.by_stage[st.id] ?? 0), 0);

  return (
    <Card noEdge className="p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-om-faint">
          Pipeline
        </span>
        <span className="text-[10.5px] text-om-muted">{total} customers</span>
      </div>

      <div className="flex h-2 w-full overflow-hidden rounded-full bg-white/[0.04]">
        {total > 0 &&
          STAGES.map((st) => {
            const n = s.by_stage[st.id] ?? 0;
            if (!n) return null;
            return (
              <div
                key={st.id}
                style={{ width: `${(n / total) * 100}%`, background: st.color }}
                title={`${st.label}: ${n}`}
              />
            );
          })}
      </div>

      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {STAGES.map((st) => {
          const n = s.by_stage[st.id] ?? 0;
          const isActive = active === st.id;
          return (
            <button
              key={st.id}
              onClick={() => onPick?.(isActive ? undefined : st.id)}
              className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] transition-colors ${
                isActive
                  ? "border-current"
                  : "border-om-border hover:border-om-border-strong"
              }`}
              style={isActive ? { color: st.color } : undefined}
            >
              <span
                className="size-2 rounded-full"
                style={{ background: st.color }}
              />
              <span className={isActive ? "font-semibold" : "text-om-dim"}>
                {st.label}
              </span>
              <span className="font-mono font-semibold text-om-muted">{n}</span>
            </button>
          );
        })}
      </div>
    </Card>
  );
}
