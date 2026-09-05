import Image from "next/image";
import { cn } from "@/lib/utils";

/** The Tolkyn T/wave mark. */
export function BrandMark({ className, size = 28 }: { className?: string; size?: number }) {
  return (
    <span className={cn("relative grid shrink-0 place-items-center", className)} style={{ width: size, height: size }}>
      <Image src="/tolkyn_logo.png" alt="" fill sizes={`${size}px`} className="object-contain" priority />
    </span>
  );
}

export function BrandLockup({ compact }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <BrandMark size={compact ? 24 : 28} />
      <div className="leading-tight">
        <div className={cn("font-semibold tracking-tight", compact ? "text-[12.5px]" : "text-[13.5px]")}>
          Tolk<span className="text-om-dim">yn</span>
        </div>
        {!compact && (
          <div className="text-[9px] font-medium uppercase tracking-[0.14em] text-om-faint">
            Social Suite
          </div>
        )}
      </div>
    </div>
  );
}
