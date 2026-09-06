import { Check, Sparkles, TrendingUp } from "lucide-react";
import { SiFacebook, SiInstagram, SiTiktok, SiWhatsapp, SiYoutube } from "react-icons/si";
import { FaLinkedinIn } from "react-icons/fa6";

/** The right-hand panel on every auth page. A static snapshot of the product
 * — no timers, no state — so it renders instantly and never shifts. Shares the
 * dark-blue brand world (.mkt tokens + aurora) with the marketing site. */

const BARS = [30, 40, 35, 48, 43, 58, 53, 68, 63, 76];
const STATS = [
  { label: "Reach", value: "248K", delta: "+12.4%", tone: "var(--mkt-blue)" },
  { label: "Engagement", value: "4.8%", delta: "+0.6pt", tone: "var(--mkt-cyan)" },
  { label: "New leads", value: "+62", delta: "+18%", tone: "var(--mkt-violet)" },
];
const PLATS = [
  { Icon: SiInstagram, c: "#E1306C" },
  { Icon: SiFacebook, c: "#1877F2" },
  { Icon: SiTiktok, c: "var(--mkt-ink-soft)" },
  { Icon: FaLinkedinIn, c: "#0A66C2" },
  { Icon: SiYoutube, c: "#FF0000" },
  { Icon: SiWhatsapp, c: "#25D366" },
];

export function AuthShowcase() {
  return (
    <div className="relative hidden overflow-hidden border-l border-mkt-line lg:block">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(55% 45% at 82% 8%, rgba(79,122,255,.18), transparent 60%), radial-gradient(48% 48% at 8% 94%, rgba(0,212,255,.10), transparent 60%)",
        }}
      />

      <div className="relative flex h-full flex-col justify-center px-12 xl:px-16">
        <div className="max-w-[440px]">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-mkt-line bg-white/[0.03] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-mkt-ink-faint">
            <span className="size-1 rounded-full bg-mkt-mint mkt-pulse" />
            One workspace
          </span>

          <h2 className="mt-4 text-[25px] font-semibold leading-[1.22] tracking-tight text-mkt-ink">
            Publishing, engagement and voice — all running in one place.
          </h2>

          {/* mini dashboard snapshot */}
          <div className="mkt-panel mkt-float mt-8 p-3">
            <div className="mb-2.5 flex items-center gap-1.5 border-b border-mkt-line-soft pb-2">
              <span className="size-2 rounded-full bg-[#ff5f57]" />
              <span className="size-2 rounded-full bg-[#febc2e]" />
              <span className="size-2 rounded-full bg-[#28c840]" />
              <span className="ml-2 font-mono text-[9.5px] text-mkt-ink-faint">app.tolkyn.co.ke</span>
              <span className="ml-auto flex items-center gap-1 rounded-full border border-mkt-mint/25 bg-mkt-mint/10 px-1.5 py-px text-[8.5px] font-semibold text-mkt-mint">
                <span className="size-1 rounded-full bg-mkt-mint mkt-pulse" />
                LIVE
              </span>
            </div>

            <div className="grid grid-cols-3 gap-1.5">
              {STATS.map((s) => (
                <div key={s.label} className="rounded-lg border border-mkt-line bg-white/[0.02] p-1.5">
                  <div className="text-[8px] text-mkt-ink-faint">{s.label}</div>
                  <div className="font-mono text-[13px] font-bold" style={{ color: s.tone }}>
                    {s.value}
                  </div>
                  <div className="text-[8px] font-semibold text-mkt-mint">{s.delta}</div>
                </div>
              ))}
            </div>

            <div className="mt-2 rounded-lg border border-mkt-line bg-white/[0.02] p-2">
              <div className="mb-1.5 text-[8px] font-medium text-mkt-ink-faint">Reach · 10 weeks</div>
              <div className="flex h-12 items-end gap-1">
                {BARS.map((h, i) => (
                  <div
                    key={i}
                    className="flex-1 rounded-t bg-gradient-to-t from-mkt-blue/70 to-mkt-cyan"
                    style={{ height: `${h}%` }}
                  />
                ))}
              </div>
            </div>

            <div className="mt-2 rounded-lg border border-mkt-blue/30 bg-mkt-blue/[0.06] p-2">
              <div className="flex items-center gap-1.5">
                <span className="grid size-4 place-items-center rounded bg-[#25D366]/20">
                  <SiWhatsapp className="size-2.5 text-[#25D366]" />
                </span>
                <span className="text-[9.5px] font-semibold text-mkt-ink">Kevin M.</span>
                <span className="text-[8.5px] text-mkt-ink-faint">WhatsApp</span>
                <span className="ml-auto font-mono text-[8.5px] text-mkt-ink-faint">+254 712 •• 431</span>
              </div>
              <div className="mt-1 text-[9.5px] text-mkt-ink-soft">Hi, is the offer still on today?</div>
              <div className="mt-1.5 flex items-start gap-1.5 rounded-md border border-mkt-line bg-white/[0.02] p-1.5">
                <Sparkles className="mt-px size-2.5 shrink-0 text-mkt-gold" />
                <span className="text-[9px] leading-snug text-mkt-ink-soft">
                  Yes! Same-day delivery to Nakuru 🚚
                  <span className="ml-1 inline-flex items-center gap-0.5 align-middle text-[8.5px] font-semibold text-mkt-mint">
                    <Check className="size-2.5" /> sent
                  </span>
                </span>
              </div>
            </div>

            <div className="mt-2 flex items-center gap-1.5 rounded-lg border border-mkt-line bg-white/[0.02] px-2 py-1.5 text-[8.5px] text-mkt-ink-soft">
              <TrendingUp className="size-2.5 text-mkt-mint" />
              Best window: <span className="font-semibold text-mkt-ink">Wed 12–2pm</span> — 2.3× median
            </div>
          </div>

          <figure className="mt-8">
            <blockquote className="text-[13px] leading-relaxed text-mkt-ink-soft">
              &ldquo;We replaced three tools and a spreadsheet. The unified inbox alone paid for
              it.&rdquo;
            </blockquote>
            <figcaption className="mt-2 text-[11px] text-mkt-ink-faint">
              Amina W. · Head of Growth
            </figcaption>
          </figure>

          <div className="mt-6 flex items-center gap-3 opacity-70">
            {PLATS.map(({ Icon, c }, i) => (
              <Icon key={i} className="size-3.5" style={{ color: c }} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
