import Image from "next/image";

/** Full-screen branded loading state — used as the App Router's automatic
 * Suspense fallback (app/loading.tsx and friends) for route transitions and
 * data fetches, so navigating around Tolkyn never flashes a blank screen or
 * a generic spinner. Pure CSS animation (see app/globals.css's tk-* rules) —
 * no client JS, so it paints the instant the route starts loading. */
export function BrandLoader({ label }: { label?: string }) {
  return (
    <div className="fixed inset-0 z-[999] grid place-items-center bg-[#080c14]">
      <div className="flex flex-col items-center gap-5">
        <div className="relative grid size-[84px] place-items-center">
          <span className="tk-ring absolute inset-0 rounded-full border border-om-blue/40" />
          <span
            className="tk-ring absolute inset-0 rounded-full border border-om-cyan/30"
            style={{ animationDelay: "0.8s" }}
          />
          <span
            className="tk-ring absolute inset-0 rounded-full border border-om-blue/30"
            style={{ animationDelay: "1.6s" }}
          />
          <div className="tk-mark relative size-11">
            <Image src="/tolkyn_logo.png" alt="Tolkyn" fill sizes="44px" className="object-contain" priority />
          </div>
        </div>

        <div className="flex flex-col items-center gap-2">
          <div className="text-[13px] font-semibold tracking-tight text-om-text">
            Tolk<span className="text-om-dim">yn</span>
          </div>
          <div className="h-[2px] w-24 overflow-hidden rounded-full bg-white/[0.06]">
            <div className="tk-shimmer-bar h-full w-full" />
          </div>
          {label && <div className="text-[10.5px] text-om-faint">{label}</div>}
        </div>
      </div>
    </div>
  );
}
