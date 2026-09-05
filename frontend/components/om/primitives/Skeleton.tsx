import { cn } from "@/lib/utils";

/** Shimmer placeholder block. Matches the route-level PageSkeleton so a page
 * can keep showing the same silhouette while its own data loads — no blank
 * gap between the route fallback and the rendered page. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("om-skel", className)} />;
}

export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn("space-y-2", className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className={cn("h-2.5", i === lines - 1 ? "w-2/3" : "w-full")} />
      ))}
    </div>
  );
}
