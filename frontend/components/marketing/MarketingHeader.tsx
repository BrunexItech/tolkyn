import Link from "next/link";
import { MktBrand } from "./MktBrand";
import { MktButton } from "./MktButton";

const LINKS = [
  { label: "How it works", href: "#how" },
  { label: "Features", href: "#features" },
  { label: "Customers", href: "#customers" },
];

export function MarketingHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-mkt-line-soft bg-mkt-canvas/70 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:gap-8 sm:px-5">
        <Link href="/" className="shrink-0">
          <span className="hidden sm:block">
            <MktBrand />
          </span>
          <span className="sm:hidden">
            <MktBrand compact />
          </span>
        </Link>
        <nav className="hidden items-center gap-7 md:flex">
          {LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="text-[12.5px] font-medium text-mkt-ink-soft transition-colors hover:text-mkt-ink"
            >
              {l.label}
            </a>
          ))}
        </nav>
        <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
          <MktButton
            href="/login"
            variant="outline"
            className="h-9 px-3.5 text-[12.5px]"
          >
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
