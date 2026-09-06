import { cn } from "@/lib/utils";

const SIZE = { sm: "size-4", md: "size-6", lg: "size-8" } as const;

/** The one spinner. A ring that spins, in the brand blue, with an optional
 * soft ping halo for the larger sizes. Use it anywhere data is loading. */
export function Spinner({
  size = "md",
  className,
}: {
  size?: keyof typeof SIZE;
  className?: string;
}) {
  return (
    <span className={cn("relative inline-flex items-center justify-center", className)}>
      {size !== "sm" && (
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-om-blue/20" />
      )}
      <span
        className={cn(
          "animate-spin rounded-full border-2 border-om-blue/25 border-t-om-blue",
          SIZE[size],
        )}
      />
    </span>
  );
}

/** Centred spinner + label, for a whole panel / list / drawer that is still
 * loading its data. Matches EmptyState's spacing so it can drop in anywhere
 * an EmptyState goes. */
export function LoadingState({
  label = "Loading…",
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-3 px-4 py-10 text-center text-om-muted",
        className,
      )}
    >
      <Spinner size="lg" />
      <div className="text-[12px] font-medium text-om-dim">{label}</div>
    </div>
  );
}
