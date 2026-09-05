import { cn } from "@/lib/utils";

interface ProgressRingProps {
  /** 0..1 */
  value: number;
  label?: string;
  sublabel?: string;
  size?: number;
  className?: string;
  gradientId?: string;
}

/** Circular progress with a blue→cyan gradient stroke. */
export function ProgressRing({
  value,
  label,
  sublabel = "done",
  size = 64,
  className,
  gradientId = "om-ring",
}: ProgressRingProps) {
  const r = size / 2 - 5;
  const circ = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value));
  const pct = label ?? `${Math.round(v * 100)}%`;

  return (
    <div className={cn("relative shrink-0", className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,.06)" strokeWidth={4} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={`url(#${gradientId})`}
          strokeWidth={4}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - v)}
          className="transition-[stroke-dashoffset] duration-300"
        />
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#4f7aff" />
            <stop offset="100%" stopColor="#22d3ee" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-mono text-[12px] font-bold">{pct}</span>
        {sublabel && <span className="text-[9px] text-om-muted">{sublabel}</span>}
      </div>
    </div>
  );
}
