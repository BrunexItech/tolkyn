import { BrandMark } from "@/components/om/shell/Brand";

/** Light-theme brand lockup for the marketing pages. */
export function MktBrand({ compact }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <BrandMark size={compact ? 24 : 28} />
      <div className="leading-tight">
        <div
          className={`font-semibold tracking-tight text-mkt-ink ${
            compact ? "text-[12.5px]" : "text-[14px]"
          }`}
        >
          Tolk<span className="text-mkt-ink-faint">yn</span>
        </div>
        {!compact && (
          <div className="text-[9px] font-semibold uppercase tracking-[0.16em] text-mkt-ink-faint">
            Social Suite
          </div>
        )}
      </div>
    </div>
  );
}
