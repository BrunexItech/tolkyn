"use client";

import { useEffect, useState } from "react";
import { Delete, Phone, RotateCcw, Play } from "lucide-react";
import { Card, CardTitle } from "@/components/om/primitives/Card";
import { OmButton } from "@/components/om/primitives/OmButton";
import { cn } from "@/lib/utils";
import { callCenterApi, type IvrSimulateResult } from "@/lib/api/callcenter";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"] as const;

const KIND_STYLE: Record<string, string> = {
  play: "text-om-blue",
  prompt: "text-om-text",
  caller: "text-om-green font-semibold",
  note: "text-om-muted italic",
};

/**
 * "Test IVR" — plays the exact caller experience for a key sequence, straight
 * off the server's own simulator. No guesswork: what you see here is what a
 * real caller hears.
 */
export function IvrTester({ dirty }: { dirty: boolean }) {
  const [digits, setDigits] = useState<string[]>([]);
  const [result, setResult] = useState<IvrSimulateResult | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    callCenterApi
      .testIvr(digits)
      .then((r) => !cancelled && setResult(r))
      .catch(() => !cancelled && setResult(null))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [digits]);

  const press = (k: string) => setDigits((d) => (d.length < 12 ? [...d, k] : d));

  return (
    <Card accent="blue" className="flex flex-col gap-2">
      <CardTitle icon={<Play />}>
        Test your call flow
        {dirty && (
          <span className="ml-2 text-[10px] font-medium text-om-amber">
            · save to test your latest edits
          </span>
        )}
      </CardTitle>

      <div className="flex items-center gap-2">
        <div className="flex h-9 flex-1 items-center rounded-lg border border-om-border bg-om-bg/60 px-2.5 font-mono text-[13px] tracking-widest text-om-text">
          {digits.length ? digits.join(" ") : <span className="text-om-muted">press keys…</span>}
        </div>
        <OmButton
          variant="ghost"
          size="sm"
          onClick={() => setDigits((d) => d.slice(0, -1))}
          disabled={!digits.length}
        >
          <Delete />
        </OmButton>
        <OmButton variant="ghost" size="sm" onClick={() => setDigits([])} disabled={!digits.length}>
          <RotateCcw />
        </OmButton>
      </div>

      <div className="mx-auto grid w-full max-w-[220px] grid-cols-3 gap-1.5">
        {KEYS.map((k) => (
          <button
            key={k}
            onClick={() => press(k)}
            className="flex h-10 items-center justify-center rounded-lg border border-om-border bg-white/[0.02] font-mono text-[15px] font-semibold text-om-text transition-colors hover:border-om-blue/50 hover:bg-om-blue/10 active:translate-y-px"
          >
            {k}
          </button>
        ))}
      </div>

      <div className="mt-1 rounded-lg border border-om-border bg-om-bg/40 p-2.5">
        <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-om-muted">
          Caller hears
        </div>
        <ol className="flex flex-col gap-1 text-[12px] leading-relaxed">
          {(result?.transcript ?? []).map((line, i) => (
            <li key={i} className={cn(KIND_STYLE[line.kind] ?? "text-om-text")}>
              {line.kind === "caller" ? "☎ " : line.kind === "note" ? "— " : "▸ "}
              {line.text}
            </li>
          ))}
          {!result?.transcript?.length && !loading && (
            <li className="text-om-muted">Nothing yet.</li>
          )}
        </ol>
        {result?.resolved && (
          <div className="mt-2 flex items-center gap-1.5 border-t border-om-border pt-2 text-[12px] font-semibold text-om-green">
            <Phone className="size-3.5" /> {result.resolved.label}
          </div>
        )}
      </div>
    </Card>
  );
}
