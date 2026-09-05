"use client";

import { ExternalLink, Lightbulb, TriangleAlert, Newspaper } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Brief } from "@/lib/api/mediaIntel";
import { relativeTime } from "@/lib/om/format";

const SENTIMENT: Record<string, string> = {
  positive: "text-om-green",
  negative: "text-om-red",
  mixed: "text-om-amber",
  neutral: "text-om-muted",
};

export function BriefView({ brief }: { brief: Brief }) {
  return (
    <div className="space-y-3">
      <div>
        <div className="flex items-center gap-2">
          <h3 className="text-[15px] font-semibold tracking-tight">{brief.headline}</h3>
          <span className={cn("text-[10.5px] font-semibold capitalize", SENTIMENT[brief.sentiment] ?? "text-om-muted")}>
            {brief.sentiment}
          </span>
        </div>
        <p className="mt-1 text-[12.5px] leading-relaxed text-om-dim">{brief.summary}</p>
        <p className="mt-1 text-[10px] text-om-faint">
          via {brief.provider} · {relativeTime(brief.generated_at)}
        </p>
      </div>

      {brief.key_developments.length > 0 && (
        <div>
          <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-om-faint">
            <Newspaper className="size-3" /> Key developments
          </div>
          <div className="space-y-1.5">
            {brief.key_developments.map((d, i) => (
              <div key={i} className="rounded-lg border border-om-border bg-white/[0.02] p-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="text-[12px] font-medium">{d.title}</div>
                  {d.recency && (
                    <span className="shrink-0 rounded bg-white/[0.05] px-1 py-px text-[9px] text-om-muted">
                      {d.recency}
                    </span>
                  )}
                </div>
                <div className="mt-0.5 text-[11px] leading-relaxed text-om-muted">{d.detail}</div>
                {d.source_url && (
                  <a
                    href={d.source_url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 inline-flex items-center gap-1 text-[10.5px] text-om-blue hover:underline"
                  >
                    {d.source_name || "source"} <ExternalLink className="size-2.5" />
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {brief.opportunities.length > 0 && (
        <div className="rounded-lg border border-om-green/25 bg-om-green/[0.06] p-2.5">
          <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-om-green">
            <Lightbulb className="size-3" /> Opportunities for your team
          </div>
          <ul className="space-y-1">
            {brief.opportunities.map((o, i) => (
              <li key={i} className="flex gap-1.5 text-[11.5px] text-om-dim">
                <span className="text-om-green">→</span>
                {o}
              </li>
            ))}
          </ul>
        </div>
      )}

      {(brief.risks?.length ?? 0) > 0 && (
        <div className="rounded-lg border border-om-amber/25 bg-om-amber/[0.06] p-2.5">
          <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-om-amber">
            <TriangleAlert className="size-3" /> Watch out for
          </div>
          <ul className="space-y-1">
            {brief.risks!.map((r, i) => (
              <li key={i} className="text-[11.5px] text-om-dim">
                {r}
              </li>
            ))}
          </ul>
        </div>
      )}

      {brief.sources.length > 0 && (
        <details className="text-[11px]">
          <summary className="cursor-pointer text-om-muted">
            {brief.sources.length} sources
          </summary>
          <div className="mt-1.5 space-y-1">
            {brief.sources.map((s, i) => (
              <a
                key={i}
                href={s.url}
                target="_blank"
                rel="noreferrer"
                className="block truncate text-om-blue hover:underline"
              >
                {s.source || s.title}
              </a>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
