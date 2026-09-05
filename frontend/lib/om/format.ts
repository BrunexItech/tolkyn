/** Small formatting helpers shared across Tolkyn panels. */

export function fmt(n: number | null | undefined): string {
  return n === null || n === undefined || Number.isNaN(n) ? "—" : Number(n).toLocaleString();
}

export function compact(n: number): string {
  if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1) + "M";
  if (Math.abs(n) >= 1_000) return (n / 1_000).toFixed(n % 1_000 === 0 ? 0 : 1) + "K";
  return String(n);
}

export function pctDelta(curr: number, prev: number): number {
  if (!prev) return 0;
  return ((curr - prev) / prev) * 100;
}

export function signedPct(v: number, digits = 1): string {
  return `${v >= 0 ? "+" : ""}${v.toFixed(digits)}%`;
}

export function clockTime(d: Date = new Date()): string {
  return d.toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function shortDateTime(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function relativeTime(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  const s = Math.round((Date.now() - date.getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function truncate(s: string, n = 60): string {
  return s.length > n ? s.slice(0, n) + "…" : s;
}
