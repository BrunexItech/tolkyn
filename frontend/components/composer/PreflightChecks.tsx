"use client";

import { CircleCheck, CircleAlert, TriangleAlert, Info, ShieldCheck } from "lucide-react";
import { Card, CardTitle } from "@/components/om/primitives/Card";
import type { ChecksResult } from "@/lib/api/posts";
import { cn } from "@/lib/utils";

const ICON = {
  error: CircleAlert,
  warn: TriangleAlert,
  info: Info,
} as const;

const CLS = {
  error: "text-om-red",
  warn: "text-om-amber",
  info: "text-om-muted",
} as const;

export function PreflightChecks({ checks }: { checks: ChecksResult | null }) {
  return (
    <Card accent={checks ? (checks.ok ? "green" : "red") : "default"}>
      <CardTitle icon={<ShieldCheck />}>
        Pre-flight
        {checks && (
          <span
            className={cn(
              "ml-auto flex items-center gap-1 text-[10.5px] font-semibold",
              checks.ok ? "text-om-green" : "text-om-red",
            )}
          >
            {checks.ok ? <CircleCheck className="size-3.5" /> : <CircleAlert className="size-3.5" />}
            {checks.ok ? "Ready to publish" : `${checks.errors} to fix`}
          </span>
        )}
      </CardTitle>

      {!checks ? (
        <p className="text-[11.5px] text-om-muted">Start writing — checks run automatically.</p>
      ) : (
        <>
          <div className="mb-2 flex gap-2 text-[10px] text-om-muted">
            <span className="font-mono">{checks.char_count} chars</span>
            <span className="font-mono">{checks.hashtag_count} #</span>
            <span className="font-mono">{checks.link_count} links</span>
            <span className="font-mono">{checks.has_media ? "media ✓" : "no media"}</span>
          </div>

          {checks.findings.length === 0 ? (
            <div className="flex items-center gap-1.5 rounded-md border border-om-green/25 bg-om-green/[0.06] px-2.5 py-2 text-[11.5px] text-om-green">
              <CircleCheck className="size-3.5" /> Everything looks good across all selected platforms.
            </div>
          ) : (
            <div className="space-y-1">
              {checks.findings.map((f, i) => {
                const Icon = ICON[f.level as keyof typeof ICON];
                return (
                  <div
                    key={i}
                    className="flex items-start gap-2 rounded-md border border-om-border bg-white/[0.02] px-2 py-1.5 text-[11px]"
                  >
                    <Icon className={cn("mt-px size-3.5 shrink-0", CLS[f.level as keyof typeof CLS])} />
                    <span className="text-om-dim">
                      {f.platform !== "all" && (
                        <span className="font-semibold capitalize text-om-muted">{f.platform}: </span>
                      )}
                      {f.message}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </Card>
  );
}
