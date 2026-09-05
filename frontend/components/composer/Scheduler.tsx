"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarClock, Loader2, Sparkles, CircleAlert } from "lucide-react";
import { Modal } from "@/components/om/primitives/Modal";
import { OmButton } from "@/components/om/primitives/OmButton";
import { analyticsApi } from "@/lib/api/analytics";
import { platform as findPlatform } from "@/lib/om/platforms";
import { shortDateTime } from "@/lib/om/format";
import type { ChecksResult } from "@/lib/api/posts";
import { cn } from "@/lib/utils";

function at(base: Date, h: number, m = 0) {
  const d = new Date(base);
  d.setHours(h, m, 0, 0);
  return d;
}
function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function nextWeekday(from: Date, weekday: number) {
  const d = new Date(from);
  const diff = (weekday - d.getDay() + 7) % 7 || 7;
  return addDays(d, diff);
}
function toLocalInput(d: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function Scheduler({
  open,
  onOpenChange,
  platforms,
  tz,
  busy,
  checks,
  initial,
  onSchedule,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  platforms: string[];
  tz?: string;
  busy: boolean;
  checks: ChecksResult | null;
  initial?: string | null;
  onSchedule: (iso: string) => void | Promise<unknown>;
}) {
  const now = new Date();
  const soon = () => toLocalInput(at(addDays(new Date(), 1), 9));
  const [custom, setCustom] = useState(soon);

  useEffect(() => {
    if (open) setCustom(initial ? toLocalInput(new Date(initial)) : soon());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const presets = useMemo(() => {
    const b = new Date();
    const list = [
      { label: "In 1 hour", date: new Date(b.getTime() + 3600_000) },
      { label: "In 3 hours", date: new Date(b.getTime() + 3 * 3600_000) },
      { label: "Tonight 6pm", date: at(b, 18) },
      { label: "Tomorrow 9am", date: at(addDays(b, 1), 9) },
      { label: "Tomorrow 6pm", date: at(addDays(b, 1), 18) },
      { label: "Saturday 10am", date: at(nextWeekday(b, 6), 10) },
      { label: "Monday 9am", date: at(nextWeekday(b, 1), 9) },
    ];
    return list.filter((p) => p.date.getTime() > b.getTime() + 60_000);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const { data: byPlat } = useQuery({
    queryKey: ["analytics", "plat", 30],
    queryFn: () => analyticsApi.byPlatform(30),
    staleTime: 5 * 60_000,
    enabled: open,
  });
  const bestTimes = (byPlat?.items ?? []).filter(
    (r) => platforms.includes(r.platform) && r.best_time && r.best_time !== "—",
  );

  const customDate = custom ? new Date(custom) : null;
  const customValid = !!customDate && customDate.getTime() > Date.now() + 60_000;
  const blocked = checks != null && !checks.ok;
  const noChannels = platforms.length === 0;

  const submit = (d: Date) => {
    if (blocked || noChannels || d.getTime() <= Date.now()) return;
    onSchedule(d.toISOString());
  };

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Schedule post"
      description={tz ? `Times are in your timezone — ${tz}` : "Pick when this should go out"}
      className="w-[min(94vw,460px)]"
      footer={
        <>
          <OmButton variant="ghost" size="sm" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </OmButton>
          <OmButton
            variant="solid"
            size="sm"
            disabled={busy || blocked || noChannels || !customValid}
            onClick={() => customDate && submit(customDate)}
          >
            {busy ? <Loader2 className="animate-spin" /> : <CalendarClock />}
            Schedule
          </OmButton>
        </>
      }
    >
      {noChannels && (
        <div className="mb-3 flex items-start gap-1.5 rounded-md border border-om-amber/30 bg-om-amber/[0.06] px-2.5 py-2 text-[11px] text-om-amber">
          <CircleAlert className="mt-px size-3.5 shrink-0" />
          Select at least one channel first.
        </div>
      )}
      {blocked && (
        <div className="mb-3 rounded-md border border-om-red/30 bg-om-red/[0.06] px-2.5 py-2 text-[11px] text-om-red">
          <div className="flex items-center gap-1.5 font-semibold">
            <CircleAlert className="size-3.5" /> Fix {checks!.errors} pre-flight error
            {checks!.errors === 1 ? "" : "s"} before scheduling
          </div>
        </div>
      )}

      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-om-faint">Quick pick</div>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {presets.map((p) => (
          <button
            key={p.label}
            disabled={busy || blocked || noChannels}
            onClick={() => submit(p.date)}
            className="rounded-lg border border-om-border bg-white/[0.03] px-2.5 py-1.5 text-[11px] text-om-dim transition-colors hover:border-om-blue/50 hover:text-om-text disabled:opacity-40"
            title={shortDateTime(p.date.toISOString())}
          >
            {p.label}
          </button>
        ))}
      </div>

      {bestTimes.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-1.5 text-[10px] text-om-muted">
          <Sparkles className="size-3 text-om-violet" /> Best times:
          {bestTimes.map((r) => {
            const p = findPlatform(r.platform);
            return (
              <span key={r.platform} className="rounded bg-white/[0.05] px-1.5 py-px">
                {p?.name ?? r.platform} · {r.best_time}
              </span>
            );
          })}
        </div>
      )}

      <div className="text-[10px] font-semibold uppercase tracking-wide text-om-faint">Custom date &amp; time</div>
      <input
        type="datetime-local"
        value={custom}
        min={toLocalInput(new Date(Date.now() + 5 * 60_000))}
        onChange={(e) => setCustom(e.target.value)}
        className={cn(
          "mt-1 w-full rounded-lg border bg-white/[0.03] px-2.5 py-2 text-[13px] text-om-text outline-none focus:border-om-blue/60",
          customValid || !custom ? "border-om-border" : "border-om-red/50",
        )}
      />
      {custom && !customValid && (
        <div className="mt-1 text-[10px] text-om-red">Pick a time at least a minute from now.</div>
      )}
      {customValid && (
        <div className="mt-1 text-[10.5px] text-om-muted">
          Goes out {shortDateTime(customDate!.toISOString())}
        </div>
      )}
    </Modal>
  );
}
