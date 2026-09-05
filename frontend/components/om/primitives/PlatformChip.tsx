import { cn } from "@/lib/utils";
import type { Platform } from "@/lib/om/platforms";

interface PlatformChipProps {
  platform: Platform;
  onClick?: () => void;
  active?: boolean;
  className?: string;
}

/** Brand-tinted platform pill (icon + name). */
export function PlatformChip({ platform, onClick, active, className }: PlatformChipProps) {
  const { Icon } = platform;
  return (
    <span
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-semibold transition-colors",
        onClick && "cursor-pointer hover:brightness-110",
        active ? "border-current" : "border-transparent",
        className,
      )}
      style={{
        color: platform.color,
        borderColor: active ? `${platform.color}66` : `${platform.color}2e`,
        background: `${platform.color}14`,
      }}
    >
      <Icon className="size-3.5" />
      {platform.name}
    </span>
  );
}

/** Bare brand icon in a tinted rounded square. */
export function PlatformGlyph({
  platform,
  size = 26,
  className,
}: {
  platform: Platform;
  size?: number;
  className?: string;
}) {
  const { Icon } = platform;
  return (
    <span
      className={cn("grid shrink-0 place-items-center rounded-lg", className)}
      style={{ width: size, height: size, background: `${platform.color}1f` }}
    >
      <Icon style={{ color: platform.color, width: size * 0.52, height: size * 0.52 }} />
    </span>
  );
}
