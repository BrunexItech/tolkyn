"use client";

import { useMemo, useRef, useState } from "react";
import {
  Search,
  X,
  Users,
  Target,
  Contact,
  Upload,
  ClipboardPaste,
  Loader2,
  FileSpreadsheet,
  BookUser,
  UserPlus,
  Plus,
} from "lucide-react";
import { OmButton } from "@/components/om/primitives/OmButton";
import { EmptyState } from "@/components/om/primitives/EmptyState";
import { toast } from "@/lib/om/toast";
import { cn } from "@/lib/utils";
import { useMessagingContacts, useImportCsv } from "./hooks";
import { usePhoneBooks } from "@/components/phonebook/hooks";
import { phoneBookApi } from "@/lib/api/phonebook";
import { useAreas } from "@/components/geo/hooks";
import type { BroadcastRecipient } from "@/lib/api/messaging";

type Mode = "leads" | "customers" | "phonebook" | "manual" | "csv" | "paste";

const LEAD_STATUS = [
  "new", "contacted", "qualified", "proposal", "negotiation",
  "closed_won", "closed_lost", "unqualified",
];
const LEAD_SCORE = ["hot", "warm", "cold", "unknown"];

const digits = (s: string) => s.replace(/\D/g, "");
// loose client-side phone check for the paste box
const looksPhone = (s: string) => /^\+?[0-9][0-9\s\-().]{6,}$/.test(s.trim());

export function RecipientPicker({
  value,
  onChange,
  accent,
  showPhoneBook = true,
}: {
  value: BroadcastRecipient[];
  onChange: (r: BroadcastRecipient[]) => void;
  accent: string;
  showPhoneBook?: boolean;
}) {
  const [mode, setMode] = useState<Mode>("leads");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [score, setScore] = useState("");
  const [paste, setPaste] = useState("");
  const [manualName, setManualName] = useState("");
  const [manualPhone, setManualPhone] = useState("");
  const [areaIds, setAreaIds] = useState<string[]>([]);
  const [loadingBook, setLoadingBook] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { data: phoneBooksData } = usePhoneBooks();
  const phoneBooks = phoneBooksData?.items ?? [];

  const { data: areasData } = useAreas();
  const areas = areasData?.items ?? [];
  const toggleArea = (id: string) =>
    setAreaIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  const isContactMode = mode === "leads" || mode === "customers";
  const { data, isFetching } = useMessagingContacts(
    {
      source: mode === "customers" ? "customer" : "lead",
      search: search || undefined,
      status: mode === "leads" && status ? status : undefined,
      score: mode === "leads" && score ? score : undefined,
      target_area_ids: areaIds.length > 0 ? areaIds : undefined,
    },
    isContactMode,
  );
  const csv = useImportCsv();

  const chosen = useMemo(() => new Set(value.map((v) => digits(v.phone))), [value]);
  const contacts = isContactMode ? data?.items ?? [] : [];

  const mergeIn = (incoming: BroadcastRecipient[]) => {
    const merged = [...value];
    let added = 0;
    for (const r of incoming) {
      const key = digits(r.phone);
      if (!key || chosen.has(key) || merged.some((m) => digits(m.phone) === key)) continue;
      merged.push(r);
      added++;
    }
    onChange(merged);
    return added;
  };

  const addAllContacts = () => {
    const n = mergeIn(
      contacts.map((c) => ({ name: c.name, phone: c.phone, source: c.source })),
    );
    toast.ok(`Added ${n} ${mode === "leads" ? "lead" : "customer"}${n === 1 ? "" : "s"}`);
  };

  const onFile = async (file?: File | null) => {
    if (!file) return;
    const res = await csv.mutateAsync(file);
    const added = mergeIn(res.recipients);
    toast.ok(
      `Imported ${added} number${added === 1 ? "" : "s"}` +
        (res.skipped ? ` · ${res.skipped} skipped` : ""),
    );
    if (fileRef.current) fileRef.current.value = "";
  };

  const addPasted = () => {
    const parts = paste
      .split(/[\n,;]+/)
      .map((p) => p.trim())
      .filter(Boolean);
    const valid = parts.filter(looksPhone);
    const added = mergeIn(valid.map((p) => ({ name: null, phone: p, source: "manual" })));
    toast.ok(
      `Added ${added} number${added === 1 ? "" : "s"}` +
        (parts.length - valid.length
          ? ` · ${parts.length - valid.length} not valid`
          : ""),
    );
    setPaste("");
  };

  const addManual = () => {
    if (!looksPhone(manualPhone)) return toast.err("Enter a valid phone number");
    const n = mergeIn([
      { name: manualName.trim() || null, phone: manualPhone.trim(), source: "manual" },
    ]);
    if (n === 0) toast.warn("That number is already in the list");
    else toast.ok("Added");
    setManualName("");
    setManualPhone("");
  };

  const remove = (phone: string) => onChange(value.filter((v) => v.phone !== phone));

  return (
    <div className="space-y-2.5">
      {/* source tabs */}
      <div className="flex flex-wrap gap-1 rounded-lg border border-om-border bg-white/[0.02] p-0.5">
        {(
          [
            ["leads", "Leads", Target],
            ["customers", "Customers", Contact],
            ...(showPhoneBook ? [["phonebook", "Phone Book", BookUser] as const] : []),
            ["manual", "Type in", UserPlus],
            ["csv", "Import CSV", FileSpreadsheet],
            ["paste", "Paste", ClipboardPaste],
          ] as const
        ).map(([m, label, Icon]) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-[11px] font-medium transition-colors",
              mode === m ? "bg-white/[0.07] text-om-text" : "text-om-muted hover:text-om-dim",
            )}
          >
            <Icon className="size-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* PHONE BOOK */}
      {mode === "phonebook" && (
        <div className="space-y-1.5">
          {phoneBooks.length === 0 ? (
            <EmptyState title="No phone books yet">
              Create one under Phone Book, then pick it here to add all its numbers.
            </EmptyState>
          ) : (
            phoneBooks.map((b) => (
              <button
                key={b.id}
                disabled={loadingBook === b.id}
                onClick={async () => {
                  setLoadingBook(b.id);
                  try {
                    const detail = await phoneBookApi.get(b.id);
                    const n = mergeIn(
                      detail.contacts.map((c) => ({
                        name: c.name,
                        phone: c.phone,
                        source: "phonebook",
                      })),
                    );
                    toast.ok(`Added ${n} number${n === 1 ? "" : "s"} from ${b.name}`);
                  } catch (e) {
                    toast.err((e as Error).message);
                  } finally {
                    setLoadingBook(null);
                  }
                }}
                className="flex w-full items-center gap-2 rounded-lg border border-om-border bg-white/[0.02] px-2.5 py-2 text-left text-[12px] transition-colors hover:border-om-blue/40 disabled:opacity-50"
              >
                <span
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ background: b.color || "var(--om-faint)" }}
                />
                <span className="flex-1 truncate text-om-dim">{b.name}</span>
                <span className="text-[10px] text-om-faint">{b.contact_count} numbers</span>
                {loadingBook === b.id ? (
                  <Loader2 className="size-3.5 animate-spin text-om-muted" />
                ) : (
                  <Users className="size-3.5 text-om-blue" />
                )}
              </button>
            ))
          )}
        </div>
      )}

      {/* LEADS / CUSTOMERS */}
      {(mode === "leads" || mode === "customers") && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[160px] flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-om-muted" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={`Search ${mode}`}
                className="w-full rounded-lg border border-om-border bg-white/[0.03] py-1.5 pl-8 pr-3 text-[12px] text-om-text outline-none placeholder:text-om-muted focus:border-om-blue/60"
              />
            </div>
            {mode === "leads" && (
              <>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="rounded-lg border border-om-border bg-white/[0.03] px-2 py-1.5 text-[11px] text-om-dim outline-none focus:border-om-blue/60"
                >
                  <option value="">Any status</option>
                  {LEAD_STATUS.map((s) => (
                    <option key={s} value={s}>
                      {s.replace("_", " ")}
                    </option>
                  ))}
                </select>
                <select
                  value={score}
                  onChange={(e) => setScore(e.target.value)}
                  className="rounded-lg border border-om-border bg-white/[0.03] px-2 py-1.5 text-[11px] text-om-dim outline-none focus:border-om-blue/60"
                >
                  <option value="">Any score</option>
                  {LEAD_SCORE.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </>
            )}
          </div>

          {areas.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="flex items-center gap-1 text-[10px] text-om-faint">
                <Target className="size-3" /> Target areas:
              </span>
              {areas.map((a) => (
                <button
                  key={a.id}
                  onClick={() => toggleArea(a.id)}
                  className={cn(
                    "rounded-md border px-1.5 py-0.5 text-[10px] font-medium transition-colors",
                    areaIds.includes(a.id)
                      ? "border-om-blue/40 bg-om-blue/15 text-om-blue"
                      : "border-om-border text-om-muted hover:text-om-dim",
                  )}
                >
                  {a.label}
                </button>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between text-[10.5px] text-om-muted">
            <span>
              {isFetching ? "Loading…" : `${contacts.length} with a valid phone`}
            </span>
            {contacts.length > 0 && (
              <button
                onClick={addAllContacts}
                className="flex items-center gap-1 font-medium text-om-blue hover:underline"
              >
                <Users className="size-3" /> Add all {contacts.length}
              </button>
            )}
          </div>

          {contacts.length > 0 && (
            <div className="om-scroll max-h-44 space-y-0.5 overflow-y-auto rounded-lg border border-om-border p-1">
              {contacts.map((c) => {
                const on = chosen.has(digits(c.phone));
                return (
                  <button
                    key={c.phone}
                    onClick={() =>
                      mergeIn([{ name: c.name, phone: c.phone, source: c.source }])
                    }
                    disabled={on}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[11.5px] transition-colors",
                      on ? "opacity-40" : "hover:bg-white/[0.04]",
                    )}
                  >
                    <span className="flex-1 truncate text-om-dim">{c.name || c.phone}</span>
                    {c.company && (
                      <span className="truncate text-[10px] text-om-muted">{c.company}</span>
                    )}
                    <span className="font-mono text-[10px] text-om-faint">{c.phone}</span>
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* CSV */}
      {mode === "csv" && (
        <div className="rounded-lg border border-dashed border-om-border bg-white/[0.02] px-4 py-6 text-center">
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv,text/plain"
            className="hidden"
            onChange={(e) => onFile(e.target.files?.[0])}
          />
          <FileSpreadsheet className="mx-auto size-6 text-om-muted" />
          <p className="mt-2 text-[12px] text-om-dim">Upload a CSV of phone numbers</p>
          <p className="mt-0.5 text-[10.5px] text-om-faint">
            Any layout — a <span className="font-mono">phone</span> / <span className="font-mono">name</span>{" "}
            column, or just one column of numbers. Kenyan <span className="font-mono">07…</span> /{" "}
            <span className="font-mono">+254…</span> both work.
          </p>
          <OmButton
            variant="solid"
            size="sm"
            className="mt-3"
            onClick={() => fileRef.current?.click()}
            disabled={csv.isPending}
          >
            {csv.isPending ? <Loader2 className="animate-spin" /> : <Upload />}
            Choose file
          </OmButton>
        </div>
      )}

      {/* MANUAL — name + number pair */}
      {mode === "manual" && (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <input
              value={manualName}
              onChange={(e) => setManualName(e.target.value)}
              placeholder="Name (optional)"
              className="min-w-[140px] flex-1 rounded-lg border border-om-border bg-white/[0.03] px-2.5 py-1.5 text-[12px] text-om-text outline-none placeholder:text-om-muted focus:border-om-blue/60"
            />
            <input
              value={manualPhone}
              onChange={(e) => setManualPhone(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addManual()}
              placeholder="Phone number"
              className="min-w-[140px] flex-1 rounded-lg border border-om-border bg-white/[0.03] px-2.5 py-1.5 font-mono text-[12px] text-om-text outline-none placeholder:text-om-muted focus:border-om-blue/60"
            />
            <OmButton variant="subtle" size="sm" onClick={addManual} disabled={!manualPhone.trim()}>
              <Plus /> Add
            </OmButton>
          </div>
          <p className="text-[10px] text-om-faint">
            The name is only kept for your reference — messages are sent to the number only.
          </p>
        </div>
      )}

      {/* PASTE */}
      {mode === "paste" && (
        <div className="space-y-2">
          <textarea
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            rows={4}
            placeholder={"Paste numbers, one per line or comma-separated\n0712345678\n+254701112223, 0733445566"}
            className="w-full resize-none rounded-lg border border-om-border bg-white/[0.03] px-2.5 py-2 font-mono text-[12px] text-om-text outline-none placeholder:text-om-muted focus:border-om-blue/60"
          />
          <OmButton
            variant="subtle"
            size="sm"
            onClick={addPasted}
            disabled={!paste.trim()}
          >
            <ClipboardPaste /> Add numbers
          </OmButton>
        </div>
      )}

      {/* selected recipients */}
      <div>
        <div className="mb-1 flex items-center justify-between text-[10px] font-semibold uppercase tracking-wide text-om-faint">
          <span>Recipients · {value.length}</span>
          {value.length > 0 && (
            <button onClick={() => onChange([])} className="text-om-muted hover:text-om-red">
              Clear all
            </button>
          )}
        </div>
        {value.length === 0 ? (
          <EmptyState title="No recipients yet">
            Pick from leads or customers, import a CSV, or paste numbers.
          </EmptyState>
        ) : (
          <div className="om-scroll flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
            {value.map((r) => (
              <span
                key={r.phone}
                className="flex items-center gap-1.5 rounded-md border border-om-border bg-white/[0.03] px-2 py-1 text-[11px]"
              >
                <span className="text-om-dim">{r.name || r.phone}</span>
                {r.name && (
                  <span className="font-mono text-[9.5px] text-om-faint">{r.phone}</span>
                )}
                <button
                  onClick={() => remove(r.phone)}
                  className="text-om-muted hover:text-om-red"
                >
                  <X className="size-3" />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
