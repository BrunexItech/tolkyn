import { PenSquare, MessagesSquare, ChartNoAxesColumn } from "lucide-react";

const STEPS = [
  {
    n: "01",
    icon: PenSquare,
    bar: "bg-[#22c55e]",
    tint: "bg-[#22c55e]/[0.07]",
    chip: "bg-[#22c55e]/15 text-[#22c55e]",
    title: "Create and schedule",
    body: "Draft a post once, tailor it per network, and queue weeks of content on a calendar. AI helps with captions, hooks and images when you want it.",
  },
  {
    n: "02",
    icon: MessagesSquare,
    bar: "bg-[#4f7aff]",
    tint: "bg-[#4f7aff]/[0.07]",
    chip: "bg-[#4f7aff]/15 text-[#4f7aff]",
    title: "Engage everywhere",
    body: "Comments, mentions, DMs and calls land in one queue. Reply, assign, or let an automation handle the routine ones. Pick up the phone from the same screen.",
  },
  {
    n: "03",
    icon: ChartNoAxesColumn,
    bar: "bg-[#f5b642]",
    tint: "bg-[#f5b642]/[0.10]",
    chip: "bg-[#f5b642]/18 text-[#f5b642]",
    title: "See what worked",
    body: "Reach, engagement, follower growth and call outcomes in one report. Know which posts and campaigns actually moved the numbers.",
  },
];

export function HowItWorks() {
  return (
    <section id="how" className="mx-auto max-w-6xl px-5 py-20">
      <div className="mb-12 max-w-xl">
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-mkt-ink-faint">
          How it works
        </span>
        <h2 className="mt-3 text-[27px] font-semibold tracking-tight text-mkt-ink sm:text-[32px]">
          One flow, from the first draft to the follow-up call
        </h2>
        <p className="mt-3 text-[13.5px] leading-relaxed text-mkt-ink-soft">
          Most teams run this on six disconnected tools. Tolkyn is the single place it
          all happens.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {STEPS.map((s) => (
          <div
            key={s.n}
            className={`relative overflow-hidden rounded-2xl border border-mkt-line ${s.tint} p-6 transition-all duration-200 hover:-translate-y-1 hover:border-white/15`}
          >
            <span className={`absolute inset-y-0 left-0 w-[3px] ${s.bar}`} />
            <div className="flex items-center justify-between">
              <span className={`grid size-11 place-items-center rounded-xl ${s.chip} [&_svg]:size-5`}>
                <s.icon />
              </span>
              <span className="font-mono text-[13px] font-semibold text-mkt-ink-faint">{s.n}</span>
            </div>
            <h3 className="mt-4 text-[15px] font-semibold text-mkt-ink">{s.title}</h3>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-mkt-ink-soft">{s.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
