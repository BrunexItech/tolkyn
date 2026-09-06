"use client";

import Link from "next/link";
import { MktBrand } from "./MktBrand";
import { MktButton } from "./MktButton";
import { setDemoView, type DemoView } from "./demoBus";

const LINKS: { label: string; view: DemoView }[] = [
  { label: "Publishing", view: "publish" },
  { label: "Engagement", view: "engage" },
  { label: "Analytics", view: "analyze" },
];

export function MarketingHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-mkt-line-soft bg-[#0a1120]/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:gap-8 sm:px-5">
        <Link href="/" className="shrink-0">
          <span className="hidden sm:block">
            <MktBrand />
          </span>
          <span className="sm:hidden">
            <MktBrand compact />
          </span>
        </Link>

        <nav className="hidden items-center gap-6 md:flex">
          {LINKS.map((l) => (
            <button
              key={l.view}
              onClick={() => setDemoView(l.view)}
              className="text-[12.5px] font-medium text-mkt-ink-soft transition-colors hover:text-mkt-ink"
            >
              {l.label}
            </button>
          ))}
          <a
            href="#how"
            className="text-[12.5px] font-medium text-mkt-ink-soft transition-colors hover:text-mkt-ink"
          >
            How it works
          </a>
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
          <MktButton href="/login" variant="outline" className="h-9 px-3.5 text-[12.5px]">
            Log in
          </MktButton>
          <MktButton href="/signup" variant="primary" className="h-9 px-4 text-[12.5px]">
            Get started
          </MktButton>
        </div>
      </div>
    </header>
  );
}
