"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarClock,
  Check,
  Headset,
  LayoutDashboard,
  MessageSquareText,
  PenSquare,
  Send,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { SiFacebook, SiInstagram, SiTiktok, SiWhatsapp, SiX, SiYoutube } from "react-icons/si";
import { FaLinkedinIn } from "react-icons/fa6";
import { onDemoView, type DemoView } from "./demoBus";

/* ------------------------------------------------------------------ data */

const PLATS = [
  { id: "instagram", Icon: SiInstagram, color: "#E1306C" },
  { id: "facebook", Icon: SiFacebook, color: "#1877F2" },
  { id: "x", Icon: SiX, color: "#cbd2e0" },
  { id: "tiktok", Icon: SiTiktok, color: "#cbd2e0" },
  { id: "linkedin", Icon: FaLinkedinIn, color: "#0A66C2" },
  { id: "youtube", Icon: SiYoutube, color: "#FF0000" },
  { id: "whatsapp", Icon: SiWhatsapp, color: "#25D366" },
] as const;

const CAPTION =
  "New feature drop — schedule once, publish everywhere, and reply from one inbox. Link in bio.";

type FeedKind = "ok" | "info" | "warn";
const FEED_POOL: { t: FeedKind; m: string; dot: string }[] = [
  { t: "ok", m: "Scheduled “Launch teaser” → Instagram, TikTok, X", dot: "#00e676" },
  { t: "info", m: "New comment from @amina_w on Facebook — routed to Inbox", dot: "#1877F2" },
  { t: "ok", m: "WhatsApp reply sent in 4.2s by automation", dot: "#25D366" },
  { t: "info", m: "@brian.otieno mentioned you on X", dot: "#cbd2e0" },
  { t: "ok", m: "Post published to LinkedIn — 3 networks live", dot: "#0A66C2" },
  { t: "warn", m: "TikTok token refreshed — reconnected automatically", dot: "#ffb627" },
  { t: "info", m: "Inbound call from +254 712 •• 431 — matched to CRM contact", dot: "#00d4ff" },
  { t: "ok", m: "Reach +12.4% vs last week across all channels", dot: "#00e676" },
  { t: "info", m: "Lead “Njoro Farms” moved to Qualified in CRM", dot: "#a855f7" },
  { t: "ok", m: "Weekly report emailed to 4 team members", dot: "#4f7aff" },
];

const INBOX: { name: string; handle: string; text: string; Icon: typeof SiX; color: string }[] = [
  { name: "Amina W.", handle: "Instagram · DM", text: "Do you ship to Nakuru? 😊", Icon: SiInstagram, color: "#E1306C" },
  { name: "Brian O.", handle: "X · mention", text: "Been using this for a week — the inbox alone is worth it.", Icon: SiX, color: "#cbd2e0" },
  { name: "Kevin M.", handle: "WhatsApp", text: "Hi, is the offer still on today?", Icon: SiWhatsapp, color: "#25D366" },
  { name: "Faith K.", handle: "Facebook · comment", text: "Just placed my order, thank you!", Icon: SiFacebook, color: "#1877F2" },
];

const VIEWS: DemoView[] = ["publish", "engage", "analyze"];

type FeedRow = { key: number; t: FeedKind; m: string; dot: string; ts: string };

/* ------------------------------------------------------------------ hooks */

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const m = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(m.matches);
    const h = () => setReduced(m.matches);
    m.addEventListener("change", h);
    return () => m.removeEventListener("change", h);
  }, []);
  return reduced;
}

/** eases a number toward `target` while `active` */
function useCountUp(target: number, active: boolean, reduced: boolean) {
  const [val, setVal] = useState(reduced ? target : 0);
  const raf = useRef<number>(0);
  useEffect(() => {
    if (reduced || !active) {
      setVal(target);
      return;
    }
    let start = 0;
    const dur = 1400;
    const tick = (now: number) => {
      if (!start) start = now;
      const p = Math.min(1, Math.max(0, (now - start) / dur));
      const eased = 1 - Math.pow(1 - p, 3);
      setVal(Math.round(target * eased));
      if (p < 1) raf.current = requestAnimationFrame(tick);
      else setVal(target);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [target, active, reduced]);
  return val;
}

/* ------------------------------------------------------------------ shell */

export function LiveDemo() {
  const reduced = useReducedMotion();
  const [view, setView] = useState<DemoView>("publish");
  const [manual, setManual] = useState(false);
  const feedTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const cycleTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // starts empty so there's nothing to mismatch on hydration, then seeds +
  // rolls entirely on the client
  const [feed, setFeed] = useState<FeedRow[]>([]);
  const feedIdx = useRef(0);

  useEffect(() => {
    // seed a few, backdated, so it doesn't start bare
    const seed: FeedRow[] = FEED_POOL.slice(0, 4).map((f, i) => ({
      ...f,
      key: i,
      ts: clock(-(4 - i) * 6),
    }));
    setFeed(seed.reverse());
    feedIdx.current = 4;

    if (reduced) return;
    feedTimer.current = setInterval(() => {
      const next = FEED_POOL[feedIdx.current % FEED_POOL.length];
      feedIdx.current += 1;
      setFeed((prev) =>
        [{ ...next, key: feedIdx.current, ts: clock() }, ...prev].slice(0, 5),
      );
    }, 2100);
    return () => {
      if (feedTimer.current) clearInterval(feedTimer.current);
    };
  }, [reduced]);

  // auto-advance the view unless the visitor took control
  useEffect(() => {
    if (reduced || manual) return;
    cycleTimer.current = setInterval(() => {
      setView((v) => VIEWS[(VIEWS.indexOf(v) + 1) % VIEWS.length]);
    }, 7800);
    return () => {
      if (cycleTimer.current) clearInterval(cycleTimer.current);
    };
  }, [reduced, manual]);

  // header-nav control
  useEffect(
    () =>
      onDemoView((v) => {
        setManual(true);
        setView(v);
        window.setTimeout(() => setManual(false), 14000);
      }),
    [],
  );

  const pick = useCallback((v: DemoView) => {
    setManual(true);
    setView(v);
    window.setTimeout(() => setManual(false), 14000);
  }, []);

  const nav = [
    { v: "publish" as const, label: "Composer", Icon: PenSquare },
    { v: "engage" as const, label: "Inbox", Icon: MessageSquareText },
    { v: "analyze" as const, label: "Analytics", Icon: TrendingUp },
  ];

  return (
    <div id="live-demo" className="mkt-rise" style={{ animationDelay: "120ms" }}>
      <div className="relative overflow-hidden rounded-2xl border border-mkt-line bg-mkt-card-hi shadow-[0_40px_120px_-30px_rgba(0,0,0,0.65)]">
        {/* aurora behind the window */}
        <div
          aria-hidden
          className="pointer-events-none absolute -inset-16 -z-10 opacity-70"
          style={{
            background:
              "radial-gradient(40% 40% at 20% 10%, rgba(79,122,255,.35), transparent 70%), radial-gradient(45% 45% at 85% 90%, rgba(0,212,255,.22), transparent 70%)",
          }}
        />

        {/* chrome */}
        <div className="flex h-9 items-center gap-1.5 border-b border-mkt-line-soft bg-white/[0.02] px-3.5">
          <span className="size-2.5 rounded-full bg-[#ff5f57]" />
          <span className="size-2.5 rounded-full bg-[#febc2e]" />
          <span className="size-2.5 rounded-full bg-[#28c840]" />
          <span className="ml-3 font-mono text-[10.5px] text-mkt-ink-faint">app.tolkyn.co.ke</span>
          <span className="ml-auto flex items-center gap-1.5 rounded-full border border-[#00e676]/25 bg-[#00e676]/10 px-2 py-0.5 text-[9.5px] font-semibold text-[#00e676]">
            <span className="size-1 rounded-full bg-[#00e676] mkt-pulse" />
            LIVE
          </span>
        </div>

        {/* fixed height so switching views only swaps the inner content —
            the card, the surrounding page and the header never reflow */}
        <div className="flex h-[420px]">
          {/* sidebar */}
          <div className="hidden w-[132px] shrink-0 flex-col gap-0.5 border-r border-mkt-line-soft bg-white/[0.015] p-2.5 sm:flex">
            <SideItem label="Dashboard" Icon={LayoutDashboard} active={false} onClick={() => pick("analyze")} />
            {nav.map((n) => (
              <SideItem
                key={n.v}
                label={n.label}
                Icon={n.Icon}
                active={view === n.v}
                onClick={() => pick(n.v)}
              />
            ))}
            <SideItem label="Call Center" Icon={Headset} active={false} onClick={() => pick("engage")} />
            <div className="mt-auto space-y-1.5 border-t border-mkt-line-soft pt-2.5">
              <div className="text-[8.5px] font-semibold uppercase tracking-[0.1em] text-mkt-ink-faint">
                Connected
              </div>
              <div className="flex flex-wrap gap-1">
                {PLATS.map((p) => (
                  <span
                    key={p.id}
                    className="grid size-5 place-items-center rounded-md border border-[#00e676]/40"
                    style={{ background: `${p.color}1f` }}
                  >
                    <p.Icon className="size-2.5" style={{ color: p.color }} />
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* main + feed */}
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="om-scroll-none min-h-0 flex-1 overflow-y-auto p-3.5">
              {view === "publish" && <PublishView reduced={reduced} key="p" />}
              {view === "engage" && <EngageView reduced={reduced} key="e" />}
              {view === "analyze" && <AnalyzeView reduced={reduced} key="a" />}
            </div>
            <ActivityFeed feed={feed} />
          </div>
        </div>

        {/* view dots */}
        <div className="flex items-center justify-center gap-1.5 border-t border-mkt-line-soft bg-white/[0.02] py-2">
          {VIEWS.map((v) => (
            <button
              key={v}
              onClick={() => pick(v)}
              aria-label={`Show ${v}`}
              className="h-1.5 rounded-full transition-all"
              style={{
                width: view === v ? 22 : 6,
                background: view === v ? "var(--mkt-blue)" : "var(--mkt-line)",
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ pieces */

function SideItem({
  label,
  Icon,
  active,
  onClick,
}: {
  label: string;
  Icon: typeof PenSquare;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-md px-1.5 py-1.5 text-left text-[10px] font-medium transition-colors ${
        active ? "bg-mkt-blue/15 text-mkt-blue" : "text-mkt-ink-faint hover:text-mkt-ink-soft"
      }`}
    >
      <Icon className="size-3" />
      {label}
    </button>
  );
}

function Field({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <div>
      <div className="mb-1 text-[9px] font-semibold uppercase tracking-[0.08em] text-mkt-ink-faint">
        {label}
      </div>
      {children}
    </div>
  );
}

/* ---- Publish ---- */
function PublishView({ reduced }: { reduced: boolean }) {
  const [typed, setTyped] = useState(reduced ? CAPTION : "");
  const [stage, setStage] = useState<"compose" | "scheduling" | "done">(
    reduced ? "done" : "compose",
  );

  useEffect(() => {
    if (reduced) return;
    setTyped("");
    setStage("compose");
    let i = 0;
    const type = setInterval(() => {
      i += 2;
      setTyped(CAPTION.slice(0, i));
      if (i >= CAPTION.length) {
        clearInterval(type);
        setTimeout(() => setStage("scheduling"), 500);
        setTimeout(() => setStage("done"), 1900);
      }
    }, 32);
    return () => clearInterval(type);
  }, [reduced]);

  return (
    <div className="mkt-tick-in space-y-2.5">
      <div className="text-[11px] font-semibold text-mkt-ink">New post · all networks</div>

      <Field label="Caption">
        <div className="min-h-[54px] rounded-lg border border-mkt-line bg-white/[0.02] p-2 text-[11px] leading-relaxed text-mkt-ink-soft">
          {typed}
        </div>
      </Field>

      <Field label="Publish to">
        <div className="flex flex-wrap gap-1.5">
          {PLATS.map((p, i) => (
            <span
              key={p.id}
              className="flex items-center gap-1 rounded-md border px-1.5 py-1 text-[9.5px] font-medium"
              style={{
                borderColor: `${p.color}55`,
                background: `${p.color}14`,
                color: p.color === "#cbd2e0" ? "var(--mkt-ink-soft)" : p.color,
                opacity: stage === "compose" && !reduced && i > 2 ? 0.35 : 1,
                transition: "opacity .3s",
              }}
            >
              <p.Icon className="size-2.5" />
            </span>
          ))}
        </div>
      </Field>

      <div className="grid grid-cols-3 gap-1.5">
        {["Mon 9:00", "Wed 12:30", "Fri 17:00"].map((slot, i) => (
          <div
            key={slot}
            className="rounded-md border border-mkt-line bg-white/[0.02] px-1.5 py-1.5 text-center"
          >
            <div className="flex items-center justify-center gap-1 text-[9px] text-mkt-ink-faint">
              <CalendarClock className="size-2.5" />
              {slot}
            </div>
            <div className="mt-1 h-1 rounded-full bg-white/[0.05]">
              <div
                className="h-full rounded-full bg-mkt-blue transition-all duration-700"
                style={{ width: stage === "done" ? `${[100, 66, 40][i]}%` : "0%" }}
              />
            </div>
          </div>
        ))}
      </div>

      <div
        className="flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-[10.5px] font-medium transition-colors"
        style={
          stage === "done"
            ? { borderColor: "rgba(0,230,118,.3)", background: "rgba(0,230,118,.08)", color: "#00e676" }
            : { borderColor: "var(--mkt-line)", background: "rgba(79,122,255,.06)", color: "var(--mkt-ink-soft)" }
        }
      >
        {stage === "done" ? <Check className="size-3.5" /> : <Send className="size-3.5" />}
        {stage === "compose" && "Ready to schedule across 7 networks"}
        {stage === "scheduling" && "Scheduling to 7 networks…"}
        {stage === "done" && "Queued — 7 networks, 3 time slots"}
      </div>
    </div>
  );
}

/* ---- Engage ---- */
function EngageView({ reduced }: { reduced: boolean }) {
  const [count, setCount] = useState(reduced ? INBOX.length : 1);
  const [replied, setReplied] = useState(reduced);
  const [reply, setReply] = useState(reduced ? "Yes! Same-day delivery to Nakuru 🚚 Want the link?" : "");

  useEffect(() => {
    if (reduced) return;
    setCount(1);
    setReplied(false);
    setReply("");
    const adds = [900, 1700, 2600].map((d, i) =>
      setTimeout(() => setCount(i + 2), d),
    );
    const full = "Yes! Same-day delivery to Nakuru 🚚 Want the link?";
    const start = setTimeout(() => {
      let i = 0;
      const type = setInterval(() => {
        i += 2;
        setReply(full.slice(0, i));
        if (i >= full.length) {
          clearInterval(type);
          setTimeout(() => setReplied(true), 400);
        }
      }, 30);
    }, 3400);
    return () => {
      adds.forEach(clearTimeout);
      clearTimeout(start);
    };
  }, [reduced]);

  return (
    <div className="mkt-tick-in space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-semibold text-mkt-ink">Unified inbox</div>
        <span className="rounded-full bg-mkt-blue/15 px-1.5 py-px text-[9px] font-bold text-mkt-blue">
          {Math.max(0, count - (replied ? 1 : 0))} unread
        </span>
      </div>

      <div className="space-y-1.5">
        {INBOX.slice(0, count).map((m, i) => {
          const isFirst = i === 0;
          return (
            <div
              key={m.name}
              className={`mkt-tick-in rounded-lg border p-2 ${
                isFirst && !replied
                  ? "border-mkt-blue/40 bg-mkt-blue/[0.06]"
                  : "border-mkt-line bg-white/[0.02]"
              }`}
            >
              <div className="flex items-center gap-1.5">
                <span
                  className="grid size-4 place-items-center rounded"
                  style={{ background: `${m.color}22` }}
                >
                  <m.Icon className="size-2.5" style={{ color: m.color === "#cbd2e0" ? "var(--mkt-ink-soft)" : m.color }} />
                </span>
                <span className="text-[10px] font-semibold text-mkt-ink">{m.name}</span>
                <span className="text-[9px] text-mkt-ink-faint">{m.handle}</span>
              </div>
              <div className="mt-0.5 text-[10px] leading-snug text-mkt-ink-soft">{m.text}</div>

              {isFirst && (reply || replied) && (
                <div className="mt-1.5 flex items-start gap-1.5 rounded-md border border-mkt-line bg-white/[0.02] p-1.5">
                  <Sparkles className="mt-px size-2.5 shrink-0 text-mkt-gold" />
                  <div className="text-[9.5px] leading-snug text-mkt-ink-soft">
                    {reply}
                    {replied && (
                      <span className="ml-1 inline-flex items-center gap-0.5 align-middle text-[9px] font-semibold text-[#00e676]">
                        <Check className="size-2.5" /> sent
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---- Analyze ---- */
function AnalyzeView({ reduced }: { reduced: boolean }) {
  const [active, setActive] = useState(false);
  useEffect(() => {
    setActive(false);
    const t = setTimeout(() => setActive(true), 60);
    return () => clearTimeout(t);
  }, []);
  const reach = useCountUp(248900, active, reduced);
  const eng = useCountUp(48, active, reduced); // 4.8%
  const fol = useCountUp(1240, active, reduced);

  const bars = [38, 52, 44, 61, 55, 72, 68, 84, 79, 92];

  return (
    <div className="mkt-tick-in space-y-2.5">
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-semibold text-mkt-ink">Last 30 days</div>
        <span className="flex items-center gap-1 rounded-full border border-[#00e676]/25 bg-[#00e676]/10 px-1.5 py-px text-[9px] font-semibold text-[#00e676]">
          <span className="size-1 rounded-full bg-[#00e676] mkt-pulse" /> Live data
        </span>
      </div>

      <div className="grid grid-cols-3 gap-1.5">
        <Stat label="Reach" value={compact(reach)} tone="#4f7aff" delta="+12.4%" />
        <Stat label="Engagement" value={`${(eng / 10).toFixed(1)}%`} tone="#00d4ff" delta="+0.6pt" />
        <Stat label="New followers" value={`+${compact(fol)}`} tone="#a855f7" delta="+18%" />
      </div>

      <div className="rounded-lg border border-mkt-line bg-white/[0.02] p-2.5">
        <div className="mb-1.5 text-[9px] font-medium text-mkt-ink-faint">Reach · 10 weeks</div>
        <div className="flex h-20 items-end gap-1.5">
          {bars.map((h, i) => (
            <div
              key={i}
              className="flex-1 rounded-t bg-gradient-to-t from-mkt-blue to-mkt-cyan transition-[height] duration-700 ease-out"
              style={{
                height: active || reduced ? `${h}%` : "3%",
                transitionDelay: `${i * 45}ms`,
              }}
            />
          ))}
        </div>
      </div>

      <div className="flex items-center gap-1.5 rounded-lg border border-mkt-line bg-white/[0.02] px-2.5 py-1.5 text-[9.5px] text-mkt-ink-soft">
        <TrendingUp className="size-3 text-[#00e676]" />
        Best window: <span className="font-semibold text-mkt-ink">Wed 12–2pm</span> — 2.3× median
        engagement
      </div>
    </div>
  );
}

function Stat({ label, value, tone, delta }: { label: string; value: string; tone: string; delta: string }) {
  return (
    <div className="relative overflow-hidden rounded-lg border border-mkt-line bg-white/[0.02] p-2">
      <div
        aria-hidden
        className="absolute -right-3 -top-3 size-10 rounded-full opacity-25 blur-lg"
        style={{ background: tone }}
      />
      <div className="text-[8.5px] text-mkt-ink-faint">{label}</div>
      <div className="font-mono text-[15px] font-bold" style={{ color: tone }}>
        {value}
      </div>
      <div className="text-[8.5px] font-semibold text-[#00e676]">{delta}</div>
    </div>
  );
}

/* ---- activity feed ---- */
function ActivityFeed({ feed }: { feed: FeedRow[] }) {
  return (
    <div className="relative border-t border-mkt-line-soft bg-black/20 px-3 py-2">
      <div className="mb-1 flex items-center gap-1.5 text-[8.5px] font-semibold uppercase tracking-[0.1em] text-mkt-ink-faint">
        <span className="size-1 rounded-full bg-[#00e676] mkt-pulse" />
        Live activity
      </div>
      <div className="min-h-[68px] space-y-0.5 font-mono text-[9.5px] leading-relaxed">
        {feed.map((f) => (
          <div key={f.key} className="mkt-tick-in flex items-start gap-1.5">
            <span className="mt-1 size-1 shrink-0 rounded-full" style={{ background: f.dot }} />
            <span className="text-mkt-ink-faint">{f.ts}</span>
            <span
              className="min-w-0 flex-1 truncate"
              style={{
                color:
                  f.t === "ok" ? "#5fd7a0" : f.t === "warn" ? "#ffce7a" : "var(--mkt-ink-soft)",
              }}
            >
              {f.m}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ utils */
function compact(n: number) {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K`;
  return String(n);
}
function clock(offsetSec = 0) {
  const d = new Date(Date.now() + offsetSec * 1000);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(
    d.getSeconds(),
  ).padStart(2, "0")}`;
}
