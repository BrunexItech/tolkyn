"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Inbox, Mail, CheckCircle2, Flame, RefreshCw, Info } from "lucide-react";
import { SectionHeading } from "@/components/om/primitives/SectionHeading";
import { Grid } from "@/components/om/primitives/Grid";
import { StatTile } from "@/components/om/primitives/StatTile";
import { Pill } from "@/components/om/primitives/Pill";
import { OmButton } from "@/components/om/primitives/OmButton";
import { PlatformChip } from "@/components/om/primitives/PlatformChip";
import { platform as findPlatform } from "@/lib/om/platforms";
import { InboxSplit } from "@/components/inbox/InboxSplit";
import { useInboxSummary, useRefreshInbox } from "@/components/inbox/hooks";
import type { InboxFilters } from "@/lib/api/inbox";
import { cn } from "@/lib/utils";

export default function InboxPage() {
  return (
    <Suspense fallback={null}>
      <InboxPageContent />
    </Suspense>
  );
}

function InboxPageContent() {
  const searchParams = useSearchParams();
  const [filters, setFilters] = useState<InboxFilters>({});
  const [selected, setSelected] = useState<string | null>(() => searchParams.get("thread"));
  const { data: s } = useInboxSummary();
  const refresh = useRefreshInbox();

  const patch = (p: Partial<InboxFilters>) => setFilters((f) => ({ ...f, ...p }));

  return (
    <div className="om-anim-rise flex h-[calc(100vh-110px)] flex-col gap-3">
      <SectionHeading
        title="Social Media Inbox"
        subtitle="Every comment, mention and DM from your connected accounts, in one queue"
        icon={<Inbox />}
        actions={
          <div className="flex items-center gap-1.5">
            {s && (
              <Pill tone={s.live ? "green" : "muted"} dot={s.live}>
                {s.live ? "Live" : "Demo data"}
              </Pill>
            )}
            <OmButton variant="ghost" size="sm" onClick={() => refresh.mutate()} disabled={refresh.isPending}>
              <RefreshCw className={refresh.isPending ? "animate-spin" : ""} /> Refresh
            </OmButton>
          </div>
        }
      />

      <Grid cols={4}>
        <StatTile label="Unread" value={s?.unread ?? "—"} icon={<Mail />} color="var(--om-blue)" />
        <StatTile label="Open" value={s?.open ?? "—"} icon={<Inbox />} color="var(--om-cyan)" />
        <StatTile label="Negative" value={s?.negative ?? "—"} icon={<Flame />} color="var(--om-red)" />
        <StatTile label="Resolved" value={s?.done ?? "—"} icon={<CheckCircle2 />} color="var(--om-green)" />
      </Grid>

      {s?.notes && s.notes.length > 0 && (
        <div className="space-y-1 rounded-lg border border-om-amber/30 bg-om-amber/[0.06] px-3 py-2">
          {s.notes.map((n, i) => (
            <div key={i} className="flex items-start gap-1.5 text-[10.5px] text-om-dim">
              <Info className="mt-px size-3 shrink-0 text-om-amber" />
              <span>
                <span className="font-semibold capitalize">{n.platform}:</span> {n.message}
              </span>
            </div>
          ))}
        </div>
      )}

      {s && Object.keys(s.by_platform).length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(s.by_platform).map(([pid, n]) => {
            const p = findPlatform(pid);
            if (!p) return null;
            return (
              <button
                key={pid}
                onClick={() => patch({ platform: filters.platform === pid ? undefined : pid })}
                className={cn(filters.platform === pid ? "" : "opacity-60")}
              >
                <PlatformChip platform={p} active={filters.platform === pid} />
                <span className="sr-only">{n}</span>
              </button>
            );
          })}
        </div>
      )}

      <InboxSplit
        filters={filters}
        onChange={patch}
        selected={selected}
        onSelect={setSelected}
        gridClassName="lg:grid-cols-[340px_1fr]"
      />
    </div>
  );
}
