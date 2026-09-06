import { PLATFORMS } from "@/lib/om/platforms";

export function LogoStrip() {
  return (
    <section className="border-y border-mkt-line-soft bg-mkt-card">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-5 px-5 py-8 sm:flex-row sm:justify-between">
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-mkt-ink-faint">
          Publishes and listens across
        </span>
        <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3">
          {PLATFORMS.map((p) => {
            const { Icon } = p;
            return (
              <span key={p.id} className="flex items-center gap-1.5 text-mkt-ink-soft">
                <Icon className="size-4" style={{ color: p.color }} />
                <span className="text-[12px] font-medium">{p.name}</span>
              </span>
            );
          })}
        </div>
      </div>
    </section>
  );
}
