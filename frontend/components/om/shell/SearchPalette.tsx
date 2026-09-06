"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Search, CornerDownLeft, Target, Contact as ContactIcon, ArrowRight } from "lucide-react";
import { NAV, PAGE_TITLES, type NavItem } from "./nav";
import { useMyRole } from "@/components/team/hooks";
import { leadsApi } from "@/lib/api/leads";
import { crmApi } from "@/lib/api/crm";

type Row =
  | { kind: "page"; key: string; label: string; sub?: string; href: string; icon: NavItem["icon"] }
  | { kind: "lead"; key: string; label: string; sub?: string; href: string }
  | { kind: "contact"; key: string; label: string; sub?: string; href: string };

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function SearchPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const { data: myRole } = useMyRole();
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const debouncedQ = useDebounced(q.trim(), 220);

  useEffect(() => {
    if (open) {
      setQ("");
      setActive(0);
      // focus after the element is mounted
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const allowed = useCallback(
    (permKey?: string, moduleKey?: string) => {
      if (!myRole) return true; // fail open until role resolves
      const permOk =
        !permKey ||
        myRole.is_owner ||
        myRole.permissions.includes("*") ||
        myRole.permissions.includes(permKey);
      const modOk =
        !moduleKey ||
        !Array.isArray(myRole.features) ||
        myRole.features.includes("*") ||
        myRole.features.includes(moduleKey);
      return permOk && modOk;
    },
    [myRole],
  );

  // --- page results (instant, client-side) ---
  const pageRows = useMemo<Row[]>(() => {
    const needle = q.trim().toLowerCase();
    const rows: Row[] = [];
    for (const section of NAV) {
      for (const it of section.items) {
        if (!allowed(it.permKey, it.moduleKey)) continue;
        const sub = PAGE_TITLES[it.href]?.subtitle;
        const hay = `${it.label} ${section.title} ${sub ?? ""}`.toLowerCase();
        if (!needle || hay.includes(needle)) {
          rows.push({
            kind: "page",
            key: `page:${it.href}`,
            label: it.label,
            sub: section.title,
            href: it.href,
            icon: it.icon,
          });
        }
      }
    }
    return needle ? rows.slice(0, 6) : rows.slice(0, 8);
  }, [q, allowed]);

  // --- live entity results (fetching) ---
  const enabled = open && debouncedQ.length >= 2;
  const { data: leads } = useQuery({
    queryKey: ["search", "leads", debouncedQ],
    queryFn: () => leadsApi.list({ search: debouncedQ, limit: 5 }),
    enabled: enabled && allowed("leads", "leads"),
    staleTime: 15_000,
  });
  const { data: contacts } = useQuery({
    queryKey: ["search", "contacts", debouncedQ],
    queryFn: () => crmApi.list({ search: debouncedQ, limit: 5 }),
    enabled: enabled && allowed("crm", "crm"),
    staleTime: 15_000,
  });

  const leadRows = useMemo<Row[]>(
    () =>
      (leads?.items ?? []).map((l) => ({
        kind: "lead" as const,
        key: `lead:${l.id}`,
        label: l.name,
        sub: [l.company, l.status].filter(Boolean).join(" · ") || "Lead",
        href: `/dashboard/leads?lead=${l.id}`,
      })),
    [leads],
  );
  const contactRows = useMemo<Row[]>(
    () =>
      (contacts?.items ?? []).map((c) => ({
        kind: "contact" as const,
        key: `contact:${c.id}`,
        label: c.name,
        sub: [c.company, c.stage].filter(Boolean).join(" · ") || "Contact",
        href: `/dashboard/crm?customer=${c.id}`,
      })),
    [contacts],
  );

  const rows = useMemo(
    () => [...pageRows, ...leadRows, ...contactRows],
    [pageRows, leadRows, contactRows],
  );

  useEffect(() => setActive(0), [rows.length]);

  const go = useCallback(
    (row?: Row) => {
      if (!row) return;
      onClose();
      router.push(row.href);
    },
    [onClose, router],
  );

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, rows.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      go(rows[active]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-idx="${active}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active]);

  if (!open) return null;

  const grouped: { title: string; rows: Row[] }[] = [
    { title: "Pages", rows: pageRows },
    { title: "Leads", rows: leadRows },
    { title: "Contacts", rows: contactRows },
  ].filter((g) => g.rows.length > 0);

  let runningIdx = -1;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center bg-black/45 px-4 pt-[12vh] backdrop-blur-[2px]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-[560px] overflow-hidden rounded-xl border border-om-border bg-om-bg2 shadow-2xl">
        <div className="flex items-center gap-2.5 border-b border-om-border px-3.5 py-3">
          <Search className="size-4 shrink-0 text-om-muted" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search pages, leads and contacts…"
            className="w-full bg-transparent text-[13px] text-om-text outline-none placeholder:text-om-muted"
          />
          <kbd className="hidden shrink-0 rounded border border-om-border px-1.5 py-px text-[10px] text-om-faint sm:block">
            Esc
          </kbd>
        </div>

        <div ref={listRef} className="om-scroll max-h-[52vh] overflow-y-auto py-1.5">
          {rows.length === 0 ? (
            <div className="px-4 py-8 text-center text-[12px] text-om-muted">
              {q.trim().length >= 2 ? "Nothing matches that." : "Type to search."}
            </div>
          ) : (
            grouped.map((g) => (
              <div key={g.title} className="mb-1">
                <div className="px-3.5 pb-1 pt-2 text-[9px] font-semibold uppercase tracking-[0.12em] text-om-faint">
                  {g.title}
                </div>
                {g.rows.map((row) => {
                  runningIdx += 1;
                  const idx = runningIdx;
                  const Icon =
                    row.kind === "page" ? row.icon : row.kind === "lead" ? Target : ContactIcon;
                  return (
                    <button
                      key={row.key}
                      data-idx={idx}
                      onMouseEnter={() => setActive(idx)}
                      onClick={() => go(row)}
                      className={`flex w-full items-center gap-2.5 px-3.5 py-2 text-left transition-colors ${
                        active === idx ? "bg-om-blue/12" : "hover:bg-white/[0.04]"
                      }`}
                    >
                      <Icon
                        className={`size-3.5 shrink-0 ${
                          active === idx ? "text-om-blue" : "text-om-faint"
                        }`}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12.5px] text-om-text">{row.label}</span>
                        {row.sub && (
                          <span className="block truncate text-[10.5px] text-om-muted">{row.sub}</span>
                        )}
                      </span>
                      {active === idx ? (
                        <CornerDownLeft className="size-3.5 shrink-0 text-om-blue" />
                      ) : (
                        <ArrowRight className="size-3.5 shrink-0 text-om-faint/40" />
                      )}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
