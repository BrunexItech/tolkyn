"use client";

import { cn } from "@/lib/utils";
import { useCallback, useState } from "react";
import { CheckCircle2, CircleAlert, Info, TriangleAlert, Dot } from "lucide-react";
import { clockTime } from "@/lib/om/format";

export type FeedTone = "ok" | "warn" | "err" | "info" | "default";

export interface FeedLine {
  id: string;
  time: string;
  msg: string;
  tone: FeedTone;
}

const TONE_TEXT: Record<FeedTone, string> = {
  ok: "text-om-green",
  warn: "text-om-amber",
  err: "text-om-red",
  info: "text-om-cyan",
  default: "text-om-dim",
};

const TONE_ICON: Record<FeedTone, typeof Info> = {
  ok: CheckCircle2,
  warn: TriangleAlert,
  err: CircleAlert,
  info: Info,
  default: Dot,
};

interface FeedProps {
  lines: FeedLine[];
  className?: string;
  height?: number | string;
}

/** Activity log. Newest line on top. */
export function Feed({ lines, className, height = 180 }: FeedProps) {
  return (
    <div
      className={cn(
        "om-scroll overflow-y-auto rounded-lg border border-om-border bg-om-bg/60 p-1.5 font-mono text-[11px]",
        className,
      )}
      style={{ height }}
    >
      {lines.map((l) => {
        const Icon = TONE_ICON[l.tone];
        return (
          <div key={l.id} className="om-anim-slide flex items-start gap-1.5 px-1 py-[3px]">
            <span className="mt-px shrink-0 text-om-faint">{l.time}</span>
            <Icon className={cn("mt-[1px] size-3 shrink-0", TONE_TEXT[l.tone])} />
            <span className={cn("flex-1 leading-[1.45]", TONE_TEXT[l.tone])}>{l.msg}</span>
          </div>
        );
      })}
    </div>
  );
}

let seq = 0;

export function useFeed(initial: Array<[string, FeedTone]> = [], max = 80) {
  const [lines, setLines] = useState<FeedLine[]>(() =>
    initial.map(([msg, tone]) => ({ id: `f${seq++}`, time: "--:--:--", msg, tone })),
  );

  const log = useCallback(
    (msg: string, tone: FeedTone = "default") => {
      setLines((prev) =>
        [{ id: `f${seq++}`, time: clockTime(), msg, tone }, ...prev].slice(0, max),
      );
    },
    [max],
  );

  const clear = useCallback(() => setLines([]), []);

  const reset = useCallback((seed: Array<[string, FeedTone]>) => {
    setLines(seed.map(([msg, tone]) => ({ id: `f${seq++}`, time: "--:--:--", msg, tone })));
  }, []);

  return { lines, log, clear, reset };
}
