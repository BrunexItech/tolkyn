"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { UsersRound, Users, UserCheck, Globe2, Plus, Trash2, Save, Search } from "lucide-react";
import { SectionHeading } from "@/components/om/primitives/SectionHeading";
import { Grid } from "@/components/om/primitives/Grid";
import { StatTile } from "@/components/om/primitives/StatTile";
import { Card, CardTitle } from "@/components/om/primitives/Card";
import { TableWrap } from "@/components/om/primitives/Table";
import { EmptyState } from "@/components/om/primitives/EmptyState";
import { OmButton } from "@/components/om/primitives/OmButton";
import { StatusBadge } from "@/components/om/primitives/StatusBadge";
import { audienceApi, type ContactFilters } from "@/lib/api/audience";
import { toast } from "@/lib/om/toast";
import { platform as findPlatform } from "@/lib/om/platforms";
import { compact, relativeTime } from "@/lib/om/format";
import { cn } from "@/lib/utils";

const SELECT =
  "rounded-lg border border-om-border bg-white/[0.03] px-2 py-1.5 text-[11.5px] text-om-dim outline-none focus:border-om-blue/60";

export default function AudiencePage() {
  const qc = useQueryClient();
  const [filters, setFilters] = useState<ContactFilters>({ source: "all", limit: 40, offset: 0 });

  const { data: ov } = useQuery({ queryKey: ["audience", "overview"], queryFn: audienceApi.overview });
  const { data: contacts } = useQuery({
    queryKey: ["audience", "contacts", filters],
    queryFn: () => audienceApi.contacts(filters),
  });
  const { data: segments } = useQuery({ queryKey: ["audience", "segments"], queryFn: audienceApi.segments });

  const createSeg = useMutation({
    mutationFn: () =>
      audienceApi.createSegment({
        name:
          [filters.source !== "all" ? filters.source : null, filters.country, filters.tag, filters.meta]
            .filter(Boolean)
            .join(" · ") || "Custom segment",
        source: filters.source || "all",
        filters: Object.fromEntries(
          Object.entries({
            country: filters.country,
            tag: filters.tag,
            meta: filters.meta,
            search: filters.search,
          }).filter(([, v]) => v),
        ) as Record<string, string>,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["audience", "segments"] });
      toast.ok("Segment saved");
    },
    onError: (e: Error) => toast.err(e.message),
  });

  const delSeg = useMutation({
    mutationFn: (id: string) => audienceApi.deleteSegment(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["audience", "segments"] }),
  });

  const patch = (p: Partial<ContactFilters>) => setFilters((f) => ({ ...f, ...p, offset: 0 }));

  const hasFilter = useMemo(
    () => !!(filters.country || filters.tag || filters.meta || filters.search || filters.source !== "all"),
    [filters],
  );

  return (
    <div className="om-anim-rise space-y-3">
      <SectionHeading
        title="Audience"
        subtitle="Followers, contacts and the segments you message"
        icon={<UsersRound />}
      />

      <Grid cols={4}>
        <StatTile label="Followers" value={ov ? compact(ov.followers_total) : "—"} icon={<UsersRound />} color="var(--om-blue)" />
        <StatTile label="Contacts" value={ov?.contacts ?? "—"} icon={<Users />} color="var(--om-cyan)" />
        <StatTile label="Leads" value={ov?.leads ?? "—"} icon={<Users />} color="var(--om-amber)" />
        <StatTile label="Customers" value={ov?.customers ?? "—"} icon={<UserCheck />} color="var(--om-green)" />
      </Grid>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card>
          <CardTitle icon={<UsersRound />}>Followers by platform</CardTitle>
          {!ov || ov.by_platform.length === 0 ? (
            <EmptyState title="Connect accounts to see followers" />
          ) : (
            <div className="space-y-2">
              {ov.by_platform.map((r) => {
                const p = findPlatform(r.platform);
                const max = ov.by_platform[0].followers || 1;
                return (
                  <div key={r.platform}>
                    <div className="mb-1 flex items-center justify-between text-[11px]">
                      <span className="flex items-center gap-1.5">
                        {p && <p.Icon className="size-3" style={{ color: p.color }} />}
                        {p?.name ?? r.platform}
                      </span>
                      <span className="font-mono text-om-dim">{compact(r.followers)}</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                      <div className="h-full rounded-full" style={{ width: `${(r.followers / max) * 100}%`, background: p?.color }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <Card>
          <CardTitle icon={<Globe2 />}>Contacts by country</CardTitle>
          {!ov || ov.by_country.length === 0 ? (
            <EmptyState title="No location data on your contacts yet" />
          ) : (
            <div className="space-y-1.5">
              {ov.by_country.map(([country, n]) => (
                <button
                  key={country}
                  onClick={() => patch({ country })}
                  className="flex w-full items-center justify-between rounded-md border border-om-border bg-white/[0.02] px-2.5 py-1.5 text-[11.5px] hover:border-om-blue/40"
                >
                  <span className="text-om-dim">{country}</span>
                  <span className="font-mono text-om-muted">{n}</span>
                </button>
              ))}
            </div>
          )}
        </Card>
      </div>

      {segments && segments.items.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {segments.items.map((s) => (
            <span
              key={s.id}
              className="flex items-center gap-1.5 rounded-md border border-om-border bg-white/[0.03] px-2 py-1 text-[11px]"
            >
              <span
                className="cursor-pointer text-om-dim"
                onClick={() => setFilters((f) => ({ ...f, ...s.filters, source: s.source, offset: 0 }))}
              >
                {s.name} <span className="font-mono text-om-muted">· {s.count}</span>
              </span>
              <button onClick={() => delSeg.mutate(s.id)} className="text-om-muted hover:text-om-red">
                <Trash2 className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      <Card noEdge className="p-0">
        <div className="flex flex-wrap items-center gap-2 border-b border-om-border p-2.5">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-om-muted" />
            <input
              defaultValue={filters.search ?? ""}
              onChange={(e) => patch({ search: e.target.value || undefined })}
              placeholder="Search contacts"
              className="w-52 rounded-lg border border-om-border bg-white/[0.03] py-1.5 pl-8 pr-3 text-[12px] text-om-text outline-none placeholder:text-om-muted focus:border-om-blue/60"
            />
          </div>
          <select value={filters.source} onChange={(e) => patch({ source: e.target.value })} className={SELECT}>
            <option value="all">All contacts</option>
            <option value="leads">Leads</option>
            <option value="customers">Customers</option>
          </select>
          <input
            value={filters.country ?? ""}
            onChange={(e) => patch({ country: e.target.value || undefined })}
            placeholder="Country"
            className={cn(SELECT, "w-28")}
          />
          <input
            value={filters.tag ?? ""}
            onChange={(e) => patch({ tag: e.target.value || undefined })}
            placeholder="Tag"
            className={cn(SELECT, "w-24")}
          />
          {hasFilter && (
            <OmButton variant="subtle" size="sm" className="ml-auto" onClick={() => createSeg.mutate()}>
              <Save /> Save as segment
            </OmButton>
          )}
        </div>

        {!contacts || contacts.items.length === 0 ? (
          <EmptyState icon={<Users />} title="No contacts match">
            Leads and customers you add show up here.
          </EmptyState>
        ) : (
          <TableWrap>
            <table>
              <thead>
                <tr>
                  <th>Contact</th>
                  <th>Type</th>
                  <th>Location</th>
                  <th>Source</th>
                  <th>Tags</th>
                  <th>Added</th>
                </tr>
              </thead>
              <tbody>
                {contacts.items.map((c) => (
                  <tr key={`${c.kind}-${c.id}`}>
                    <td>
                      <div className="font-medium">{c.name}</div>
                      <div className="text-[10px] text-om-muted">{c.company || c.email}</div>
                    </td>
                    <td>
                      <StatusBadge tone={c.kind === "customer" ? "green" : "blue"}>{c.meta}</StatusBadge>
                    </td>
                    <td className="text-om-muted">{c.country || c.location || "—"}</td>
                    <td className="text-[10.5px] text-om-dim">{c.source}</td>
                    <td>
                      <div className="flex flex-wrap gap-1">
                        {c.tags.slice(0, 3).map((t) => (
                          <span key={t} className="rounded bg-white/[0.05] px-1 py-px text-[9px] text-om-muted">
                            {t}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="text-om-muted">{c.created_at ? relativeTime(c.created_at) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Card>
    </div>
  );
}
