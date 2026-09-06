"use client";

import { useMemo, useState } from "react";
import {
  Radar,
  Flame,
  TrendingUp,
  Inbox,
  Search,
  RefreshCw,
  Sparkles,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Card } from "@/components/om/primitives/Card";
import { Grid } from "@/components/om/primitives/Grid";
import { StatTile } from "@/components/om/primitives/StatTile";
import { Pill } from "@/components/om/primitives/Pill";
import { OmButton } from "@/components/om/primitives/OmButton";
import { EmptyState } from "@/components/om/primitives/EmptyState";
import { platform as findPlatform } from "@/lib/om/platforms";
import { relativeTime } from "@/lib/om/format";
import { cn } from "@/lib/utils";
import { SocialLeadCard } from "./SocialLeadCard";
import { SocialLeadDrawer } from "./SocialLeadDrawer";
import {
  useScanSocialLeads,
  useSocialLeads,
  useSocialLeadSummary,
} from "./hooks";
import type { SocialLead, SocialLeadFilters } from "@/lib/api/socialLeads";

const INTENTS = [
  { id: "hot", label: "Hot" },
  { id: "warm", label: "Warm" },
  { id: "cold", label: "Cold" },
] as const;

const STATUSES = [
  { id: "new", label: "New" },
  { id: "contacted", label: "Contacted" },
  { id: "qualified", label: "Qualified" },
  { id: "converted", label: "Converted" },
  { id: "dismissed", label: "Dismissed" },
] as const;

export function SocialLeadsPanel() {
  const [filters, setFilters] = useState<SocialLeadFilters>({
    leads_only: true,
    limit: 20,
    offset: 0,
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: summary } = useSocialLeadSummary();
  const { data, isLoading } = useSocialLeads(filters);
  const scan = useScanSocialLeads();

  const selected: SocialLead | null =
    data?.items.find((l) => l.id === selectedId) ?? null;

  const patch = (p: Partial<SocialLeadFilters>) =>
    setFilters((f) => ({ ...f, ...p }));

  const limit = filters.limit ?? 20;
  const offset = filters.offset ?? 0;
  const total = data?.total ?? 0;

  const products = summary?.by_product ?? [];
  const platformEntries = useMemo(
    () => Object.entries(summary?.by_platform ?? {}),
    [summary],
  );

  return (
    <div className="space-y-3">
      {/* scan bar */}
      <Card noEdge className="flex flex-wrap items-center gap-3 p-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-om-violet/12 text-om-violet">
          <Radar className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[12.5px] font-semibold text-om-text">
            Find leads in your comments and DMs
          </div>
          <div className="text-[11px] text-om-muted">
            AI reads every comment and message on your connected accounts and pulls
            out the people who want to buy.
            {summary?.last_scan_at && (
              <> Last scan {relativeTime(summary.last_scan_at)}.</>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {summary && (
            <>
              <Pill tone={summary.live ? "green" : "muted"} dot={summary.live}>
                {summary.live ? "Live accounts" : "No accounts"}
              </Pill>
              <Pill tone={summary.ai ? "blue" : "amber"}>
                {summary.ai ? "AI on" : "AI offline"}
              </Pill>
            </>
          )}
          <OmButton
            variant="solid"
            size="sm"
            onClick={() => scan.mutate()}
            disabled={scan.isPending}
          >
            <RefreshCw className={scan.isPending ? "animate-spin" : ""} />
            {scan.isPending ? "Scanning…" : "Scan now"}
          </OmButton>
        </div>
      </Card>

      {!summary?.ai && (
        <div className="flex items-start gap-1.5 rounded-lg border border-om-amber/30 bg-om-amber/[0.06] px-3 py-2 text-[10.5px] text-om-dim">
          <Sparkles className="mt-px size-3 shrink-0 text-om-amber" />
          <span>
            The OpenAI account is out of credits, so leads are matched with keyword
            rules for now. Add credits at platform.openai.com/settings/organization/billing
            for full AI classification.
          </span>
        </div>
      )}

      {/* stats */}
      <Grid cols={4}>
        <StatTile
          label="Potential leads"
          value={summary?.leads ?? "—"}
          icon={<Inbox />}
          color="var(--om-violet)"
        />
        <StatTile
          label="Hot"
          value={summary?.hot ?? "—"}
          icon={<Flame />}
          color="var(--om-red)"
        />
        <StatTile
          label="Warm"
          value={summary?.warm ?? "—"}
          icon={<TrendingUp />}
          color="var(--om-amber)"
        />
        <StatTile
          label="Converted"
          value={summary?.converted ?? "—"}
          icon={<Sparkles />}
          color="var(--om-green)"
        />
      </Grid>

      {/* product interest */}
      {products.length > 0 && (
        <Card noEdge className="p-3">
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-om-faint">
            What they are asking about
          </div>
          <div className="flex flex-wrap gap-1.5">
            {products.map((p) => (
              <button
                key={p.name}
                onClick={() =>
                  patch({
                    search: filters.search === p.name ? undefined : p.name,
                    offset: 0,
                  })
                }
                className={cn(
                  "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition-colors",
                  filters.search === p.name
                    ? "border-om-violet/40 bg-om-violet/15 text-om-violet"
                    : "border-om-border bg-white/[0.03] text-om-dim hover:text-om-text",
                )}
              >
                {p.name}
                <span className="rounded-full bg-white/[0.08] px-1.5 text-[10px] font-semibold">
                  {p.count}
                </span>
              </button>
            ))}
          </div>
        </Card>
      )}

      {/* filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-om-muted" />
          <input
            value={filters.search ?? ""}
            onChange={(e) =>
              patch({ search: e.target.value || undefined, offset: 0 })
            }
            placeholder="Search name, message, product"
            className="w-64 rounded-lg border border-om-border bg-white/[0.03] py-1.5 pl-8 pr-3 text-[12px] text-om-text outline-none placeholder:text-om-muted focus:border-om-blue/60"
          />
        </div>

        <div className="flex gap-1">
          {INTENTS.map((i) => (
            <button
              key={i.id}
              onClick={() =>
                patch({
                  intent: filters.intent === i.id ? undefined : i.id,
                  offset: 0,
                })
              }
              className={cn(
                "rounded-md border px-2 py-1.5 text-[11px] font-medium transition-colors",
                filters.intent === i.id
                  ? "border-om-blue/40 bg-om-blue/12 text-om-blue"
                  : "border-om-border text-om-muted hover:text-om-dim",
              )}
            >
              {i.label}
            </button>
          ))}
        </div>

        <select
          value={filters.status ?? ""}
          onChange={(e) =>
            patch({
              status: (e.target.value || undefined) as SocialLeadFilters["status"],
              offset: 0,
            })
          }
          className="rounded-lg border border-om-border bg-white/[0.03] px-2 py-1.5 text-[11.5px] text-om-dim outline-none focus:border-om-blue/60"
        >
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>

        {platformEntries.length > 1 && (
          <select
            value={filters.platform ?? ""}
            onChange={(e) =>
              patch({ platform: e.target.value || undefined, offset: 0 })
            }
            className="rounded-lg border border-om-border bg-white/[0.03] px-2 py-1.5 text-[11.5px] text-om-dim outline-none focus:border-om-blue/60"
          >
            <option value="">All platforms</option>
            {platformEntries.map(([pid]) => (
              <option key={pid} value={pid}>
                {findPlatform(pid)?.name ?? pid}
              </option>
            ))}
          </select>
        )}

        <label className="ml-auto flex cursor-pointer items-center gap-1.5 text-[11px] text-om-muted">
          <input
            type="checkbox"
            checked={filters.leads_only ?? false}
            onChange={(e) =>
              patch({ leads_only: e.target.checked || undefined, offset: 0 })
            }
            className="accent-om-blue"
          />
          Leads only
        </label>
      </div>

      {/* list */}
      {isLoading ? (
        <Card noEdge>
          <EmptyState loading title="Loading…" />
        </Card>
      ) : !data || data.items.length === 0 ? (
        <Card noEdge>
          <EmptyState icon={<Radar />} title="No social leads yet">
            {summary?.live
              ? 'Hit "Scan now" to have AI read your latest comments and messages.'
              : "Connect a social account first, then scan your comments for leads."}
          </EmptyState>
        </Card>
      ) : (
        <>
          <div className="grid gap-2.5 md:grid-cols-2">
            {data.items.map((lead) => (
              <SocialLeadCard
                key={lead.id}
                lead={lead}
                onOpen={() => setSelectedId(lead.id)}
                onConvert={() => setSelectedId(lead.id)}
              />
            ))}
          </div>

          {total > limit && (
            <div className="flex items-center justify-between px-1 text-[11px] text-om-muted">
              <span>
                {offset + 1}–{Math.min(offset + limit, total)} of {total}
              </span>
              <div className="flex gap-1">
                <OmButton
                  variant="ghost"
                  size="xs"
                  disabled={offset === 0}
                  onClick={() => patch({ offset: Math.max(0, offset - limit) })}
                >
                  <ChevronLeft /> Prev
                </OmButton>
                <OmButton
                  variant="ghost"
                  size="xs"
                  disabled={offset + limit >= total}
                  onClick={() => patch({ offset: offset + limit })}
                >
                  Next <ChevronRight />
                </OmButton>
              </div>
            </div>
          )}
        </>
      )}

      <SocialLeadDrawer
        lead={selected}
        onOpenChange={(v) => !v && setSelectedId(null)}
      />
    </div>
  );
}
