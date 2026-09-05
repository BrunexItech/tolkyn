import { ArrowRight, ShieldCheck } from "lucide-react";
import { MktButton } from "./MktButton";
import { ProductPreview } from "./ProductPreview";

export function Hero() {
  return (
    <section className="mx-auto max-w-6xl px-5 pb-20 pt-16 md:pt-24">
      <div className="grid grid-cols-1 items-center gap-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.06fr)]">
        <div className="mkt-rise min-w-0">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-mkt-line bg-white/[0.04] px-3 py-1 text-[11px] font-medium text-mkt-ink-soft">
            <span className="size-1.5 rounded-full bg-[#22c55e]" />
            One workspace for every channel
          </span>

          <h1 className="mt-5 text-[29px] font-semibold leading-[1.1] tracking-tight text-mkt-ink [text-wrap:balance] sm:text-[40px] lg:text-[46px]">
            Publish, engage and call — all from one place
          </h1>

          <p className="mt-5 max-w-md text-[14.5px] leading-relaxed text-mkt-ink-soft">
            Schedule content across every network, reply from a single inbox, run a built-in
            call center, and watch what it all does to your reach and revenue. Tolkyn is
            the whole loop, in one clean workspace.
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

        <div className="mkt-rise min-w-0 max-w-full" style={{ animationDelay: "120ms" }}>
          <ProductPreview />
        </div>
      </div>
    </section>
  );
}
