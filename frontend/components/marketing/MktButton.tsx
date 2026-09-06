import Link from "next/link";
import { cn } from "@/lib/utils";

type Variant = "primary" | "dark" | "outline" | "ghost";

const STYLES: Record<Variant, string> = {
  primary:
    "bg-gradient-to-br from-[#4f7aff] to-[#2a58d5] text-white shadow-[0_10px_30px_-10px_rgba(79,122,255,0.7)] hover:-translate-y-0.5 hover:shadow-[0_16px_40px_-10px_rgba(79,122,255,0.75)] hover:brightness-110",
  dark: "bg-mkt-ink text-mkt-canvas hover:-translate-y-0.5",
  outline:
    "border border-mkt-line bg-white/[0.03] text-mkt-ink hover:border-[#4f7aff]/60 hover:bg-white/[0.07] hover:-translate-y-0.5",
  ghost: "text-mkt-ink-soft hover:text-mkt-ink",
};

export function MktButton({
  href,
  variant = "primary",
  className,
  children,
}: {
  href: string;
  variant?: Variant;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex h-10 items-center justify-center gap-1.5 rounded-xl px-5 text-[13px] font-medium transition-all duration-200 [&_svg]:size-4",
        STYLES[variant],
        className,
      )}
    >
      {children}
    </Link>
  );
}
