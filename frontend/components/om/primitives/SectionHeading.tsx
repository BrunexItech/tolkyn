import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

interface SectionHeadingProps {
  title: ReactNode;
  subtitle?: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

/** Page / panel header: icon + title + subtitle on the left, actions on the right. */
export function SectionHeading({
  title,
  subtitle,
  icon,
  actions,
  className,
}: SectionHeadingProps) {
  return (
    <div className={cn("mb-3 flex flex-wrap items-center justify-between gap-2", className)}>
      <div className="flex items-center gap-2.5">
        {icon != null && (
          <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-om-border bg-om-card text-om-blue [&_svg]:size-4">
            {icon}
          </span>
        )}
        <div>
          <div className="text-[13.5px] font-semibold tracking-tight">{title}</div>
          {subtitle != null && (
            <div className="text-[11px] text-om-muted">{subtitle}</div>
          )}
        </div>
      </div>
      {actions != null && <div className="flex flex-wrap items-center gap-1.5">{actions}</div>}
    </div>
  );
}
