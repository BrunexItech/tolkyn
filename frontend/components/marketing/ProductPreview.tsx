import { Check, Dot, TriangleAlert, LayoutDashboard, Inbox, Headset, PenSquare, ChartNoAxesColumn, UsersRound } from "lucide-react";

const NAV = [
  { label: "Dashboard", icon: LayoutDashboard },
  { label: "Inbox", icon: Inbox },
  { label: "Call Center", icon: Headset },
  { label: "Composer", icon: PenSquare },
  { label: "Analytics", icon: ChartNoAxesColumn },
  { label: "Audience", icon: UsersRound },
];

/** Faux-app window used as the hero visual — mirrors the real dark app. Pure markup + SVG. */
export function ProductPreview() {
  return (
    <div className="relative mkt-float">
      <div className="pointer-events-none absolute inset-0 -z-10 rounded-[28px] bg-[#4f7aff]/18 blur-2xl" />
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#0b1120] shadow-[0_40px_100px_-30px_rgba(0,0,0,0.7)]">
        {/* window bar */}
        <div className="flex h-9 items-center gap-1.5 border-b border-white/[0.06] bg-white/[0.02] px-3.5">
          <span className="size-2.5 rounded-full bg-[#ff5f57]" />
          <span className="size-2.5 rounded-full bg-[#febc2e]" />
          <span className="size-2.5 rounded-full bg-[#28c840]" />
          <span className="ml-3 text-[10.5px] font-medium text-mkt-ink-faint">Tolkyn — Dashboard</span>
        </div>

        <div className="flex">
          {/* mini sidebar */}
          <div className="hidden w-32 shrink-0 flex-col gap-0.5 border-r border-white/[0.06] bg-white/[0.015] p-2.5 sm:flex">
            {NAV.map((n, i) => (
              <div
                key={n.label}
                className={`flex items-center gap-1.5 rounded-md px-1.5 py-1.5 text-[9.5px] font-medium ${
                  i === 0 ? "bg-white/[0.06] text-mkt-ink" : "text-mkt-ink-faint"
                }`}
              >
                <n.icon className="size-3" />
                {n.label}
              </div>
            ))}
          </div>

          {/* content */}
          <div className="flex-1 space-y-2.5 p-3.5">
            <div className="grid grid-cols-3 gap-2">
              {[
                { k: "Reach", v: "248K" },
                { k: "Engagement", v: "4.8%" },
                { k: "Calls today", v: "63" },
              ].map((s) => (
                <div key={s.k} className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-2">
                  <div className="text-[8.5px] font-medium text-mkt-ink-faint">{s.k}</div>
                  <div className="font-mono text-[14px] font-bold text-mkt-ink">{s.v}</div>
                </div>
              ))}
            </div>

            <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-2.5">
              <div className="mb-1.5 text-[9px] font-medium text-mkt-ink-faint">Reach · 14 days</div>
              <svg viewBox="0 0 320 70" className="h-16 w-full" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="mkt-pp-fill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#22c55e" stopOpacity="0.30" />
                    <stop offset="100%" stopColor="#22c55e" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <path
                  d="M0 55 L26 48 L52 52 L78 38 L104 42 L130 28 L156 33 L182 20 L208 26 L234 14 L260 22 L286 10 L320 16 L320 70 L0 70 Z"
                  fill="url(#mkt-pp-fill)"
                />
                <path
                  d="M0 55 L26 48 L52 52 L78 38 L104 42 L130 28 L156 33 L182 20 L208 26 L234 14 L260 22 L286 10 L320 16"
                  fill="none"
                  stroke="#22c55e"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />
              </svg>
            </div>

            <div className="space-y-1 rounded-lg border border-white/[0.06] bg-white/[0.02] p-2.5 text-[9.5px] leading-relaxed text-mkt-ink-soft">
              <div className="flex items-center gap-1.5">
                <Check className="size-2.5 shrink-0 text-[#22c55e]" /> Scheduled &ldquo;Launch teaser&rdquo; to Instagram and TikTok
              </div>
              <div className="flex items-center gap-1.5">
                <Dot className="size-2.5 shrink-0 text-mkt-ink-faint" /> Analytics refreshed — reach up 12.5 percent
              </div>
              <div className="flex items-center gap-1.5">
                <TriangleAlert className="size-2.5 shrink-0 text-[#f5b642]" /> 12 comments waiting for a reply
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
