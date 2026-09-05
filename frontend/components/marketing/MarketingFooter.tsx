import Link from "next/link";
import { MktBrand } from "./MktBrand";

const COLS: { title: string; links: { label: string; href?: string }[] }[] = [
  {
    title: "Product",
    links: [
      { label: "Publishing" },
      { label: "Inbox" },
      { label: "Call Center" },
      { label: "Analytics" },
      { label: "Automations" },
    ],
  },
  {
    title: "Company",
    links: [{ label: "About" }, { label: "Customers" }, { label: "Careers" }, { label: "Blog" }],
  },
  {
    title: "Legal",
    links: [
      { label: "Privacy", href: "/privacy" },
      { label: "Terms", href: "/terms" },
      { label: "Security" },
      { label: "DPA" },
    ],
  },
];

export function MarketingFooter() {
  return (
    <footer className="border-t border-mkt-line-soft bg-white/[0.02]">
      <div className="mx-auto max-w-6xl px-5 py-14">
        <div className="grid gap-10 sm:grid-cols-[1.5fr_repeat(3,1fr)]">
          <div>
            <MktBrand />
            <p className="mt-4 max-w-xs text-[11.5px] leading-relaxed text-mkt-ink-soft">
              One workspace for teams that publish, engage and pick up the phone.
            </p>
          </div>
          {COLS.map((c) => (
            <div key={c.title}>
              <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-mkt-ink-faint">
                {c.title}
              </div>
              <ul className="mt-3.5 space-y-2.5">
                {c.links.map((l) => (
                  <li key={l.label}>
                    {l.href ? (
                      <Link
                        href={l.href}
                        className="text-[12px] text-mkt-ink-soft transition-colors hover:text-mkt-ink"
                      >
                        {l.label}
                      </Link>
                    ) : (
                      <span className="cursor-default text-[12px] text-mkt-ink-soft transition-colors hover:text-mkt-ink">
                        {l.label}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-12 flex flex-col items-center justify-between gap-2 border-t border-mkt-line-soft pt-6 text-[11px] text-mkt-ink-faint sm:flex-row">
          <span>© {new Date().getFullYear()} Tolkyn. All rights reserved.</span>
          <div className="flex gap-5">
            <Link href="/login" className="hover:text-mkt-ink">
              Log in
            </Link>
            <Link href="/signup" className="hover:text-mkt-ink">
              Get started
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
