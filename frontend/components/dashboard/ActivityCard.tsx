"use client";

import { useEffect, useMemo, useRef } from "react";
import { Activity } from "lucide-react";
import { Card, CardTitle } from "@/components/om/primitives/Card";
import { Feed, useFeed, type FeedTone } from "@/components/om/primitives/Feed";
import { feedBus } from "@/components/om/feed-bus";
import { relativeTime } from "@/lib/om/format";
import { useAllPosts } from "./hooks";

export function ActivityCard() {
  const { data } = useAllPosts();

  const seed = useMemo<Array<[string, FeedTone]>>(() => {
    const posts = [...(data?.items ?? [])]
      .filter((p) => p.status !== "draft")
      .sort((a, b) =>
        (b.published_at ?? b.updated_at).localeCompare(a.published_at ?? a.updated_at),
      )
      .slice(0, 8);

    return posts.map((p) => {
      const text = (p.body || p.title || "a post").slice(0, 48);
      const when = p.published_at ?? p.scheduled_at;
      const ago = when ? ` · ${relativeTime(when)}` : "";
      if (p.status === "published")
        return [`Published “${text}” to ${p.platforms.join(", ")}${ago}`, "ok"];
      if (p.status === "partial")
        return [`Partly published “${text}” — some channels failed${ago}`, "warn"];
      if (p.status === "failed")
        return [`Failed to publish “${text}”${ago}`, "err"];
      if (p.status === "scheduled")
        return [`Scheduled “${text}”${ago}`, "info"];
      if (p.status === "publishing") return [`Publishing “${text}”…`, "info"];
      return [`Draft updated: “${text}”`, "default"];
    });
  }, [data]);

  const { lines, log, reset } = useFeed(seed);
  const seeded = useRef(false);

  // seed once, when the real data first arrives
  useEffect(() => {
    if (!seeded.current && data && seed.length) {
      seeded.current = true;
      reset(seed);
    }
  }, [data, seed, reset]);

  useEffect(() => feedBus.subscribe(log), [log]);

  return (
    <Card>
      <CardTitle icon={<Activity />}>Activity</CardTitle>
      {lines.length === 0 ? (
        <div className="py-10 text-center text-[11.5px] text-om-muted">
          Nothing yet — publish a post to start the log.
        </div>
      ) : (
        <Feed lines={lines} height={196} />
      )}
    </Card>
  );
}
