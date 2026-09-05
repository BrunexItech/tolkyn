"use client";

import { useState } from "react";
import { Wand2, Loader2, ChevronDown, ChevronUp, ArrowRight, Ban, Lightbulb } from "lucide-react";
import { cn } from "@/lib/utils";
import { useBuildPrompt } from "./hooks";
import { PromptCount } from "./PromptCount";
import { PROMPT_LIMITS, canSubmitPrompt } from "./limits";
import type { PromptResult } from "@/lib/api/studio";

export function PromptHelper({
  intent,
  onUse,
  onAppend,
  defaultOpen = false,
}: {
  intent: "image" | "video";
  onUse: (prompt: string) => void;
  onAppend?: (fragment: string) => void;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [brief, setBrief] = useState("");
  const [result, setResult] = useState<PromptResult | null>(null);
  const build = useBuildPrompt();

  const briefOk = canSubmitPrompt(brief, PROMPT_LIMITS.brief);

  const run = () => {
    if (!briefOk) return;
    build.mutate({ intent, brief: brief.trim() }, { onSuccess: (r) => setResult(r) });
  };

  return (
    <div className="mt-2 rounded-lg border border-om-violet/25 bg-om-violet/[0.06]">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-semibold text-om-violet"
      >
        <Wand2 className="size-3.5" />
        Prompt helper — describe it, get a proper prompt
        {open ? <ChevronUp className="ml-auto size-3.5" /> : <ChevronDown className="ml-auto size-3.5" />}
      </button>

      {open && (
        <div className="space-y-2 border-t border-om-violet/20 p-2.5">
          <textarea
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            onKeyDown={(e) => (e.metaKey || e.ctrlKey) && e.key === "Enter" && run()}
            rows={2}
            placeholder={
              intent === "image"
                ? "e.g. a friendly logo for a coffee cart called Brew Bus"
                : "e.g. a 20s explainer showing how our app schedules posts"
            }
            className="w-full rounded-md border border-om-border bg-white/[0.03] px-2 py-1.5 text-[11.5px] text-om-text outline-none focus:border-om-violet/60"
          />
          <PromptCount value={brief} limit={PROMPT_LIMITS.brief} />
          <button
            onClick={run}
            disabled={build.isPending || !briefOk}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md bg-om-violet px-2.5 py-1 text-[11px] font-semibold text-white disabled:opacity-50",
            )}
          >
            {build.isPending ? <Loader2 className="size-3 animate-spin" /> : <Wand2 className="size-3" />}
            Write prompt
          </button>

          {result && (
            <div className="space-y-2">
              <div className="rounded-md border border-om-border bg-om-bg/50 px-2 py-1.5 text-[11px] leading-relaxed text-om-dim">
                {result.prompt}
              </div>
              <button
                onClick={() => onUse(result.prompt)}
                className="inline-flex items-center gap-1 rounded-md bg-om-violet/15 px-2 py-1 text-[10.5px] font-semibold text-om-violet hover:bg-om-violet/25"
              >
                Use this prompt <ArrowRight className="size-3" />
              </button>

              {result.style_tips.length > 0 && (
                <div>
                  <div className="mb-1 flex items-center gap-1 text-[9.5px] font-semibold uppercase tracking-wide text-om-faint">
                    <Lightbulb className="size-3" /> Add a style
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {result.style_tips.map((t, i) => (
                      <button
                        key={i}
                        onClick={() => (onAppend ? onAppend(t) : onUse(`${result.prompt}. ${t}`))}
                        className="rounded-md border border-om-border bg-white/[0.02] px-1.5 py-0.5 text-[10px] text-om-muted hover:border-om-violet/40 hover:text-om-dim"
                      >
                        + {t}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {result.negative_prompt && (
                <div className="flex items-start gap-1.5 text-[10px] text-om-muted">
                  <Ban className="mt-px size-3 shrink-0 text-om-red" />
                  <span>Avoid: {result.negative_prompt}</span>
                </div>
              )}
              {result.notes && (
                <div className="text-[10px] text-om-faint">{result.notes}</div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
