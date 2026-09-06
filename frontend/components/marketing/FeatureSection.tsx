import {
  CalendarClock,
  Inbox,
  Headset,
  ChartNoAxesColumn,
  Sparkles,
  Workflow,
  UsersRound,
  Megaphone,
} from "lucide-react";

// cards are organized like the Connected Accounts page: white card, coloured
// left bar + faint tint. Colour rotates green → blue → amber. No colour in text.
const TONES = [
  { bar: "bg-[#22c55e]", tint: "bg-[#22c55e]/[0.07]", chip: "bg-[#22c55e]/15 text-[#22c55e]" },
  { bar: "bg-[#4f7aff]", tint: "bg-[#4f7aff]/[0.07]", chip: "bg-[#4f7aff]/15 text-[#4f7aff]" },
  { bar: "bg-[#f5b642]", tint: "bg-[#f5b642]/[0.09]", chip: "bg-[#f5b642]/18 text-[#f5b642]" },
];

const FEATURES = [
  { icon: CalendarClock, title: "Publishing and scheduling", body: "Compose once, tailor per network, and queue weeks of content on a visual calendar." },
  { icon: Inbox, title: "Unified inbox", body: "Comments, mentions and DMs from every account in one triaged, assignable stream." },
  { icon: Headset, title: "Built-in call center", body: "Take inbound calls, run outbound campaigns, route a queue, and record every conversation." },
  { icon: ChartNoAxesColumn, title: "Analytics that matter", body: "Reach, engagement, follower growth and share of voice, with exportable reports." },
  { icon: Sparkles, title: "AI content studio", body: "On-brand captions, hooks, hashtags and images, generated and edited by chat." },
  { icon: Workflow, title: "Automations", body: "Trigger replies, hand-offs, tags and alerts with no-code rules across channels." },
  { icon: UsersRound, title: "Audience and CRM", body: "Unify followers and contacts into segments you can actually message and target." },
  { icon: Megaphone, title: "Campaigns", body: "Plan multi-channel pushes with briefs, approvals and a shared results view." },
];

export function FeatureSection() {
  return (
    <section id="features" className="border-y border-mkt-line-soft bg-mkt-veil">
      <div className="mx-auto max-w-6xl px-5 py-24">
        <div className="mb-12 max-w-xl">
          <span className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-mkt-ink-faint">
            Features
          </span>
          <h2 className="mt-3 text-[27px] font-semibold tracking-tight text-mkt-ink sm:text-[32px]">
            Everything a social team runs, in one place
          </h2>
          <p className="mt-3 text-[13.5px] leading-relaxed text-mkt-ink-soft">
            Stop stitching together six tools. Tolkyn covers the full loop.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f, i) => {
            const t = TONES[i % 3];
            return (
              <div
                key={f.title}
                className="mkt-panel overflow-hidden p-5 transition-all duration-200 hover:-translate-y-1 hover:border-mkt-blue/40 hover:bg-mkt-card-hi"
              >
                <span className={`absolute inset-y-0 left-0 w-[3px] ${t.bar}`} />
                <span className={`grid size-10 place-items-center rounded-xl ${t.chip} [&_svg]:size-[19px]`}>
                  <f.icon />
                </span>
                <h3 className="mt-4 text-[13.5px] font-semibold text-mkt-ink">{f.title}</h3>
                <p className="mt-1.5 text-[11.5px] leading-relaxed text-mkt-ink-soft">{f.body}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
