import Link from "next/link";
import type { ReactNode } from "react";
import { BrandLockup } from "@/components/om/shell/Brand";
import { AuthShowcase } from "./AuthShowcase";

/** Shell for every logged-out page (login, signup, reset, invite…). Lives in
 * the marketing `.mkt` dark-blue world — a user who lands here just came from,
 * or is about to enter, the product, so it should feel like one surface. The
 * form sits in a lifted panel, vertically centred; the right column shows a
 * static product snapshot (`AuthShowcase`). Form controls and the primary
 * button are restyled via the `.auth-form` scope in globals.css, so the
 * individual pages don't each hand-roll brand styling. */
export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const hasSubtitle = typeof subtitle === "string" ? subtitle.trim().length > 0 : subtitle != null;

  return (
    <div className="mkt font-sans">
      <style>{`html,body{background:#0a1120}`}</style>
      <div className="mkt-bg" aria-hidden />
      <div className="mkt-grid" aria-hidden />

      <div className="relative z-10 grid min-h-screen lg:grid-cols-[1fr_1.04fr]">
        {/* form side */}
        <div className="flex min-h-screen flex-col px-5 py-6 sm:px-8">
          <Link
            href="/"
            className="inline-flex w-fit items-center rounded-lg transition-opacity hover:opacity-80"
          >
            <BrandLockup />
          </Link>

          <div className="flex flex-1 items-center justify-center py-8">
            <div className="auth-form w-full max-w-[380px]">
              <div className="mkt-panel mkt-rise p-6 sm:p-7">
                <h1 className="text-[20px] font-semibold tracking-tight text-mkt-ink">{title}</h1>
                {hasSubtitle && (
                  <p className="mt-1 text-[12.5px] leading-relaxed text-mkt-ink-soft">{subtitle}</p>
                )}
                <div className="mt-5">{children}</div>
              </div>
              {footer != null && (
                <p className="mt-4 text-center text-[12px] leading-relaxed text-mkt-ink-soft">
                  {footer}
                </p>
              )}
            </div>
          </div>

          <div className="text-[11px] text-mkt-ink-faint">
            © {new Date().getFullYear()} Tolkyn ·{" "}
            <Link href="/terms" className="hover:text-mkt-ink-soft">
              Terms
            </Link>{" "}
            ·{" "}
            <Link href="/privacy" className="hover:text-mkt-ink-soft">
              Privacy
            </Link>
          </div>
        </div>

        {/* product snapshot side */}
        <AuthShowcase />
      </div>
    </div>
  );
}
