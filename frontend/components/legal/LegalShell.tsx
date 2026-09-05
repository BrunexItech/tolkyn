import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { BrandLockup } from "@/components/om/shell/Brand";
import { LEGAL_EFFECTIVE } from "./version";

/** Page chrome for the public /terms and /privacy documents. */
export function LegalShell({
  title,
  intro,
  children,
}: {
  title: string;
  intro: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="relative z-10 min-h-screen">
      <header className="border-b border-om-border">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-5 py-4">
          <Link href="/">
            <BrandLockup />
          </Link>
          <Link
            href="/"
            className="flex items-center gap-1.5 text-[12px] font-medium text-om-muted transition-colors hover:text-om-text"
          >
            <ArrowLeft className="size-3.5" /> Back to site
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 py-10">
        <h1 className="text-[26px] font-semibold tracking-tight">{title}</h1>
        <p className="mt-1.5 text-[12px] text-om-faint">Effective {LEGAL_EFFECTIVE}</p>
        <div className="mt-5 text-[13px] leading-relaxed text-om-dim">{intro}</div>

        <div className="om-legal mt-8 space-y-7">{children}</div>

        <div className="mt-12 flex flex-wrap gap-4 border-t border-om-border pt-5 text-[12px] text-om-muted">
          <Link href="/terms" className="hover:text-om-text">Terms of Service</Link>
          <Link href="/privacy" className="hover:text-om-text">Privacy Policy</Link>
          <Link href="/login" className="hover:text-om-text">Log in</Link>
          <Link href="/signup" className="hover:text-om-text">Create account</Link>
        </div>
      </main>
    </div>
  );
}

/** One numbered section of a legal document. */
export function LegalSection({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="text-[15px] font-semibold text-om-text">
        {n}. {title}
      </h2>
      <div className="mt-2 space-y-2.5 text-[13px] leading-relaxed text-om-dim [&_a]:text-om-blue [&_a:hover]:underline [&_li]:ml-4 [&_li]:list-disc [&_ul]:space-y-1.5">
        {children}
      </div>
    </section>
  );
}
