"use client";

import { Flame } from "lucide-react";
import { Card, CardTitle } from "@/components/om/primitives/Card";
import { EmptyState } from "@/components/om/primitives/EmptyState";
import { Delta } from "@/components/om/primitives/Delta";
import { platform as findPlatform } from "@/lib/om/platforms";
import { compact } from "@/lib/om/format";
import { useTopPosts } from "./hooks";

export function TopPostsCard() {
  const { data } = useTopPosts(6);
  const items = data?.items ?? [];

  return (
    <Card>
      <CardTitle icon={<Flame />}>Top posts</CardTitle>
      {items.length === 0 ? (
        <EmptyState title="Publish something to see top posts">
          Your best-performing posts will rank here.
        </EmptyState>
      ) : (
        <div className="flex flex-col">
          {items.map((p) => {
            const pl = findPlatform(p.platform);
            const Icon = pl?.Icon;
            return (
              <div
                key={p.id}
                className="flex items-center gap-3 border-b border-white/[0.04] py-2 last:border-0"
              >
                {Icon && (
                  <span
                    className="grid size-6 shrink-0 place-items-center rounded-md"
                    style={{ background: `${pl!.color}24` }}
                  >
                    <Icon className="size-3" style={{ color: pl!.color }} />
                  </span>
                )}
                <span className="flex-1 truncate text-[12px]">{p.text || "(no text)"}</span>
                <span className="shrink-0 font-mono text-[10.5px] text-om-muted">
                  {compact(p.reach)} reach
                </span>
                <Delta value={p.engagement_rate} suffix="%" />
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
