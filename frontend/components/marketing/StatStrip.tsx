const STATS = [
  { v: "7", k: "networks in one composer" },
  { v: "38%", k: "faster response time, on average" },
  { v: "2.1M", k: "conversations handled monthly" },
  { v: "99.98%", k: "publishing uptime" },
];

export function StatStrip() {
  return (
    <section id="customers" className="mx-auto max-w-6xl px-5 py-16">
      <div className="grid grid-cols-2 gap-8 rounded-2xl border border-mkt-line bg-mkt-card px-8 py-10 md:grid-cols-4">
        {STATS.map((s) => (
          <div key={s.k}>
            <div className="font-mono text-[30px] font-bold leading-none text-mkt-ink">{s.v}</div>
            <div className="mt-2 text-[11.5px] leading-snug text-mkt-ink-soft">{s.k}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
