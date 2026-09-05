"use client";

import { useEffect, useState } from "react";
import { Radar, Loader2, CheckCircle2, Sparkles, MapPin } from "lucide-react";
import { Modal } from "@/components/om/primitives/Modal";
import { Field, OmInput, OmTextarea } from "@/components/om/primitives/Field";
import { OmButton } from "@/components/om/primitives/OmButton";
import { useDiscoverLeads } from "./hooks";
import { useAreas } from "@/components/geo/hooks";
import type { DiscoverResponse } from "@/lib/api/leads";

const EXAMPLES = [
  "Boutique digital marketing agencies in Austin that work with SaaS startups",
  "Series A fintech companies in the UK hiring a Head of Growth",
  "Independent coffee roasters in California with a wholesale program",
];

const STEPS = [
  "Understanding your request…",
  "Searching the web for matching companies…",
  "Scanning company sites for contact details…",
  "Scoring and summarising each lead…",
];

export function GenerateLeadsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [prompt, setPrompt] = useState("");
  const [offer, setOffer] = useState("");
  const [fromCompany, setFromCompany] = useState("");
  const [fromWebsite, setFromWebsite] = useState("");
  const [maxResults, setMaxResults] = useState(12);
  const [areaIds, setAreaIds] = useState<string[]>([]);
  const [result, setResult] = useState<DiscoverResponse | null>(null);
  const [step, setStep] = useState(0);

  const discover = useDiscoverLeads();
  const { data: areasData } = useAreas();
  const areas = areasData?.items ?? [];

  const toggleArea = (id: string) =>
    setAreaIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  useEffect(() => {
    if (!discover.isPending) return;
    setStep(0);
    const id = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 9000);
    return () => clearInterval(id);
  }, [discover.isPending]);

  const close = (v: boolean) => {
    onOpenChange(v);
    if (!v)
      setTimeout(() => {
        setResult(null);
        discover.reset();
      }, 200);
  };

  const run = () => {
    if (prompt.trim().length < 6) return;
    setResult(null);
    discover.mutate(
      {
        prompt: prompt.trim(),
        offer: offer.trim(),
        from_company: fromCompany.trim(),
        from_website: fromWebsite.trim(),
        max_results: maxResults,
        target_area_ids: areaIds,
      },
      { onSuccess: (r) => setResult(r) },
    );
  };

  return (
    <Modal
      open={open}
      onOpenChange={close}
      title="Find leads"
      description="Describe who you want to reach. Tolkyn searches the web, pulls contact details and scores each company for fit."
      footer={
        result ? (
          <OmButton variant="solid" size="sm" onClick={() => close(false)}>
            Done
          </OmButton>
        ) : (
          <>
            <OmButton variant="ghost" size="sm" onClick={() => close(false)} disabled={discover.isPending}>
              Cancel
            </OmButton>
            <OmButton
              variant="solid"
              size="sm"
              onClick={run}
              disabled={discover.isPending || prompt.trim().length < 6}
            >
              {discover.isPending ? <Loader2 className="animate-spin" /> : <Radar />}
              {discover.isPending ? "Searching…" : "Find leads"}
            </OmButton>
          </>
        )
      }
    >
      {result ? (
        <ResultView result={result} />
      ) : discover.isPending ? (
        <RunningView step={step} prompt={prompt} />
      ) : (
        <div className="space-y-1">
          <Field label="What are you looking for?">
            <OmTextarea
              autoFocus
              rows={3}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="e.g. B2B SaaS companies in Berlin, 20–100 employees, that recently launched a mobile app"
            />
          </Field>
          <div className="mb-2 flex flex-wrap gap-1">
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                onClick={() => setPrompt(ex)}
                className="rounded-md border border-om-border bg-white/[0.02] px-2 py-0.5 text-[10.5px] text-om-muted transition-colors hover:border-om-blue/40 hover:text-om-dim"
              >
                {ex}
              </button>
            ))}
          </div>

          {areas.length > 0 && (
            <Field label="Scope to your target areas (optional)" className="mb-2">
              <div className="flex flex-wrap gap-1.5">
                {areas.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => toggleArea(a.id)}
                    className={`flex items-center gap-1 rounded-md border px-2 py-1 text-[10.5px] font-medium transition-colors ${
                      areaIds.includes(a.id)
                        ? "border-om-blue/40 bg-om-blue/15 text-om-blue"
                        : "border-om-border text-om-muted hover:text-om-dim"
                    }`}
                  >
                    <MapPin className="size-3" />
                    {a.label}
                  </button>
                ))}
              </div>
              <p className="mt-1 text-[10px] text-om-faint">
                {areaIds.length > 0
                  ? "The search will focus specifically on companies in these areas."
                  : "Leave unselected to search anywhere. Manage areas under Geo Targeting."}
              </p>
            </Field>
          )}

          <div className="rounded-lg border border-om-border bg-white/[0.02] p-2.5">
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-om-faint">
              Your business — used to write each email &amp; proposal
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Business name" className="mb-2">
                <OmInput
                  value={fromCompany}
                  onChange={(e) => setFromCompany(e.target.value)}
                  placeholder="Acme Studio"
                />
              </Field>
              <Field label="Website" className="mb-2">
                <OmInput
                  value={fromWebsite}
                  onChange={(e) => setFromWebsite(e.target.value)}
                  placeholder="acmestudio.com"
                />
              </Field>
            </div>
            <Field label="What you offer them" className="mb-0">
              <OmTextarea
                rows={2}
                value={offer}
                onChange={(e) => setOffer(e.target.value)}
                placeholder="e.g. Brand & web design retainers for early-stage SaaS companies"
              />
            </Field>
          </div>

          <Field label="How many leads?">
            <select
              value={maxResults}
              onChange={(e) => setMaxResults(Number(e.target.value))}
              className="w-full rounded-lg border border-om-border bg-white/[0.03] px-2.5 py-2 text-[12.5px] text-om-text outline-none focus:border-om-blue/60"
            >
              <option value={6}>Up to 6</option>
              <option value={12}>Up to 12</option>
              <option value={20}>Up to 20</option>
            </select>
          </Field>
        </div>
      )}
    </Modal>
  );
}

function RunningView({ step, prompt }: { step: number; prompt: string }) {
  return (
    <div className="py-4">
      <div className="flex items-center gap-2 rounded-lg border border-om-border bg-white/[0.02] px-3 py-2 text-[12px] text-om-dim">
        <Sparkles className="size-4 shrink-0 text-om-blue" />
        <span className="line-clamp-2">{prompt}</span>
      </div>
      <div className="mt-4 space-y-2.5">
        {STEPS.map((label, i) => (
          <div key={label} className="flex items-center gap-2.5 text-[12px]">
            {i < step ? (
              <CheckCircle2 className="size-4 shrink-0 text-om-green" />
            ) : i === step ? (
              <Loader2 className="size-4 shrink-0 animate-spin text-om-blue" />
            ) : (
              <span className="size-4 shrink-0 rounded-full border border-om-border" />
            )}
            <span className={i <= step ? "text-om-dim" : "text-om-muted"}>{label}</span>
          </div>
        ))}
      </div>
      <p className="mt-4 text-[11px] text-om-muted">
        This can take up to a minute — Tolkyn visits each company site directly.
      </p>
    </div>
  );
}

function ResultView({ result }: { result: DiscoverResponse }) {
  const s = result.stats;
  const rows: [string, string | number][] = [
    ["Sites scanned", s.sites_scanned],
    ["Companies found", s.companies_found],
    ["Saved", s.saved],
    ["Time", `${s.duration_seconds.toFixed(0)}s`],
  ];
  return (
    <div>
      <div className="flex items-center gap-2 rounded-lg border border-om-green/25 bg-om-green/10 px-3 py-2 text-[12px] text-om-green">
        <CheckCircle2 className="size-4 shrink-0" />
        {result.message}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {rows.map(([k, v]) => (
          <div key={k} className="rounded-lg border border-om-border bg-white/[0.02] px-3 py-2">
            <div className="text-[10px] text-om-muted">{k}</div>
            <div className="font-mono text-[15px] font-bold">{v}</div>
          </div>
        ))}
      </div>
      {result.leads.length > 0 && (
        <div className="mt-3 space-y-1">
          <div className="text-[10.5px] font-semibold uppercase tracking-wide text-om-muted">
            New leads
          </div>
          {result.leads.map((l) => (
            <div
              key={l.id}
              className="flex items-center gap-2 rounded-md border border-om-border bg-white/[0.02] px-2.5 py-1.5 text-[11.5px]"
            >
              <span className="flex-1 truncate font-medium">{l.name}</span>
              <span className="truncate text-om-muted">{l.email || l.website_url || "—"}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
