import { ArrowRight, ShieldCheck } from "lucide-react";
import { MktButton } from "./MktButton";
import { LiveDemo } from "./LiveDemo";

export function Hero() {
  return (
    <section className="mx-auto max-w-6xl px-5 pb-14 pt-8 md:pt-10 lg:pt-12">
      <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] lg:gap-10">
        <div className="mkt-rise min-w-0">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-mkt-line bg-white/[0.03] px-3 py-1 text-[11px] font-medium text-mkt-ink-soft">
            <span className="size-1.5 rounded-full bg-[#00e676] mkt-pulse" />
            One workspace for every channel
          </span>

          <h1 className="mt-6 text-[30px] font-semibold leading-[1.08] tracking-[-0.02em] text-mkt-ink [text-wrap:balance] sm:text-[42px] lg:text-[47px]">
            Publish, engage and call — all from one place
          </h1>

          <p className="mt-5 max-w-md text-[14.5px] leading-relaxed text-mkt-ink-soft">
            Schedule content across every network, reply from a single inbox, run a built-in
            call center, and watch what it all does to your reach and revenue. This is the whole
            loop, live — that&apos;s the real product on the right.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <MktButton href="/signup" variant="primary" className="h-11 px-6 text-[13.5px]">
              Create your workspace <ArrowRight />
            </MktButton>
            <MktButton href="/login" variant="outline" className="h-11 px-6 text-[13.5px]">
              Log in
            </MktButton>
          </div>

          <div className="mt-5 flex items-center gap-1.5 text-[11.5px] text-mkt-ink-faint">
            <ShieldCheck className="size-3.5 text-mkt-mint" />
            Role-based access, audit logs and SSO on every plan
          </div>
        </div>

        <div className="min-w-0 max-w-full">
          <LiveDemo />
        </div>
      </div>
    </section>
  );
}
