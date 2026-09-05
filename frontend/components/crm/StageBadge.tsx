import { cn } from "@/lib/utils";
import type { CustomerStage } from "@/lib/api/crm";

const MAP: Record<CustomerStage, { label: string; cls: string }> = {
  lead: { label: "Lead", cls: "bg-white/[0.05] text-om-muted border-om-border" },
  prospect: { label: "Prospect", cls: "bg-om-blue/12 text-om-blue border-om-blue/25" },
  trial: { label: "Trial", cls: "bg-om-amber/12 text-om-amber border-om-amber/25" },
  active: { label: "Active", cls: "bg-om-green/12 text-om-green border-om-green/25" },
  churned: { label: "Churned", cls: "bg-om-red/12 text-om-red border-om-red/25" },
};

export function StageBadge({ stage, className }: { stage: CustomerStage; className?: string }) {
  const s = MAP[stage] ?? MAP.prospect;
  return (
    <span
      className={cn(
        "inline-block rounded-md border px-1.5 py-0.5 text-[10.5px] font-semibold",
        s.cls,
        className,
      )}
    >
      {s.label}
    </span>
  );
}
