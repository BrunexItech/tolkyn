import { ArrowRight, LogIn } from "lucide-react";
import { MktButton } from "./MktButton";

/** Closing call-to-action — a lifted, blue-washed panel with a soft aurora. */
export function CtaBand() {
  return (
    <section className="mx-auto max-w-6xl px-5 py-24">
      <div className="mkt-dark relative isolate overflow-hidden rounded-3xl border border-mkt-line p-12 text-center shadow-[0_40px_120px_-40px_rgba(0,0,0,0.6)]">
        <div className="pointer-events-none absolute -left-20 -top-24 size-72 rounded-full bg-[#00e676]/16 blur-[90px]" />
        <div className="pointer-events-none absolute -right-16 -top-16 size-72 rounded-full bg-[#4f7aff]/26 blur-[90px]" />
        <div className="pointer-events-none absolute -bottom-28 left-1/3 size-80 rounded-full bg-[#00d4ff]/14 blur-[100px]" />
        <div className="pointer-events-none absolute inset-0 rounded-3xl ring-1 ring-inset ring-white/[0.06]" />

        <h2 className="relative text-[26px] font-semibold tracking-tight text-mkt-ink sm:text-[32px]">
          Bring it all into one workspace
        </h2>
        <p className="relative mx-auto mt-3 max-w-md text-[13.5px] leading-relaxed text-mkt-ink-soft">
          Set up your channels, invite your team, and run publishing, engagement and calls
          from a single clean place. It takes about a minute to start.
        </p>
        <div className="relative mt-7 flex flex-wrap items-center justify-center gap-3">
          <MktButton href="/signup" variant="primary" className="h-11 px-6 text-[13.5px]">
            Create your workspace <ArrowRight />
          </MktButton>
          <MktButton href="/login" variant="outline" className="h-11 px-6 text-[13.5px]">
            <LogIn /> Log in
          </MktButton>
        </div>
      </div>
    </section>
  );
}
