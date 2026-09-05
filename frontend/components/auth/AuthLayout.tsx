import Link from "next/link";
import type { ReactNode } from "react";
import { ShieldCheck, Zap, Headset } from "lucide-react";
import { BrandLockup } from "@/components/om/shell/Brand";

const POINTS = [
  { icon: Zap, text: "Schedule across 7 networks from one composer" },
  { icon: Headset, text: "Inbound & outbound calls without a separate phone system" },
  { icon: ShieldCheck, text: "SSO, audit logs and role-based access" },
];

export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <div className="relative z-10 grid min-h-screen lg:grid-cols-2">
      {/* form side */}
      <div className="flex flex-col px-5 py-8">
        <Link href="/" className="mb-auto">
          <BrandLockup />
        </Link>

        <div className="mx-auto w-full max-w-sm py-10">
          <h1 className="text-[22px] font-semibold tracking-tight">{title}</h1>
          <p className="mt-1 text-[13px] text-om-muted">{subtitle}</p>
          <div className="mt-6">{children}</div>
          <p className="mt-6 text-center text-[12.5px] text-om-muted">{footer}</p>
        </div>

        <div className="mb-0 mt-auto text-[11px] text-om-faint">
          © {new Date().getFullYear()} Tolkyn
        </div>
      </div>

      {/* brand side */}
      <div className="relative hidden overflow-hidden border-l border-om-border bg-gradient-to-br from-om-card to-[#0b1730] lg:flex lg:flex-col lg:justify-center lg:px-14">
        <div className="pointer-events-none absolute -right-24 -top-24 size-80 rounded-full bg-om-blue/15 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -left-16 size-80 rounded-full bg-om-cyan/10 blur-3xl" />
        <div className="relative max-w-md">
          <div className="text-[24px] font-semibold leading-tight tracking-tight">
            One workspace for publishing, engagement and voice.
          </div>
          <ul className="mt-8 space-y-4">
            {POINTS.map((p) => (
              <li key={p.text} className="flex items-start gap-3">
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-om-blue/12 text-om-blue">
                  <p.icon className="size-4" />
                </span>
                <span className="pt-1 text-[13px] text-om-dim">{p.text}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
