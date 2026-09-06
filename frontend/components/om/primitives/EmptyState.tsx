import { cn } from "@/lib/utils";
import type { ReactNode } from "react";
import { Spinner } from "./Spinner";

/** Centred muted placeholder for empty panels / lists. Pass `loading` to show
 * the brand spinner in place of the icon while data is on its way. */
export function EmptyState({
  icon,
  title,
  children,
  action,
  className,
  loading = false,
}: {
  icon?: ReactNode;
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
  loading?: boolean;
}) {
  return (
    <div className={cn("flex flex-col items-center px-4 py-8 text-center text-om-muted", className)}>
      {loading ? (
        <span className="mb-3">
          <Spinner size="lg" />
        </span>
      ) : (
        icon != null && (
          <span className="mb-2 grid size-9 place-items-center rounded-lg border border-om-border bg-om-card text-om-dim [&_svg]:size-[18px]">
            {icon}
          </span>
        )
      )}
      {title != null && <div className="mb-1 text-[12.5px] font-semibold text-om-dim">{title}</div>}
      {children != null && <div className="max-w-sm text-[11.5px] leading-relaxed">{children}</div>}
      {action != null && <div className="mt-3">{action}</div>}
    </div>
  );
}
