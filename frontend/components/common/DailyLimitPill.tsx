"use client";

import { ImageIcon, Clapperboard } from "lucide-react";
import { useMyRole } from "@/components/team/hooks";

/** "3 / 20 today" for AI image or video generation. Renders nothing when the
 * workspace has no cap (or the role hasn't loaded). */
export function DailyLimitPill({ kind }: { kind: "image" | "video" }) {
  const { data } = useMyRole();
  if (!data) return null;

  const used = kind === "image" ? data.images_today : data.videos_today;
  const limit = kind === "image" ? data.images_daily_limit : data.videos_daily_limit;
  if (limit == null) return null;

  const left = Math.max(0, limit - used);
  const tone =
    limit === 0 || left === 0
      ? "border-om-red/30 bg-om-red/10 text-om-red"
      : left <= Math.max(1, Math.round(limit * 0.2))
        ? "border-om-amber/30 bg-om-amber/10 text-om-amber"
        : "border-om-border bg-white/[0.03] text-om-muted";
  const Icon = kind === "image" ? ImageIcon : Clapperboard;

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10.5px] font-medium ${tone}`}
      title={
        limit === 0
          ? `${kind === "image" ? "Image" : "Video"} generation is turned off for this workspace`
          : `${used} of ${limit} ${kind}s generated today — resets at midnight UTC`
      }
    >
      <Icon className="size-3" />
      {limit === 0 ? "Off" : `${used} / ${limit} today`}
    </span>
  );
}
