"use client";

import { useMemo, useState } from "react";
import { Bookmark, X, Search } from "lucide-react";
import { useAssets } from "@/components/studio/hooks";
import { platform as findPlatform } from "@/lib/om/platforms";
import { relativeTime, truncate } from "@/lib/om/format";
import type { CopyGroup } from "@/lib/api/studio";

interface FlatCaption {
  key: string;
  title: string | null;
  platform: string;
  text: string;
  hashtags: string[];
  angle: string;
  createdAt: string;
}

/** Every caption explicitly saved (with a title) in Content Studio → Copy,
 * flattened into one searchable, pickable list — so a caption saved once
 * doesn't only live on the Content Studio screen it was written on. The
 * title is shown here to help find it, but is never inserted into the post —
 * onPick only ever passes the caption text and hashtags. */
export function SavedCaptionsPicker({ onPick }: { onPick: (body: string, hashtags: string[]) => void }) {
  const { data, isLoading } = useAssets("copy");
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const captions: FlatCaption[] = useMemo(() => {
    const out: FlatCaption[] = [];
    for (const a of data?.items ?? []) {
      const payload = a.payload as { text?: string; hashtags?: string[]; angle?: string; results?: CopyGroup[] } | null;
      if (payload?.text) {
        // explicitly saved, single caption — the current format
        out.push({
          key: a.id,
          title: a.title,
          platform: a.platform || "",
          text: payload.text,
          hashtags: payload.hashtags ?? [],
          angle: payload.angle ?? "",
          createdAt: a.created_at,
        });
      } else {
        // legacy batch-saved generations from before titled saving existed
        for (const g of payload?.results ?? []) {
          g.variants.forEach((v, i) =>
            out.push({
              key: `${a.id}-${g.platform}-${i}`,
              title: null,
              platform: g.platform,
              text: v.text,
              hashtags: v.hashtags ?? [],
              angle: v.angle,
              createdAt: a.created_at,
            }),
          );
        }
      }
    }
    return out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }, [data]);

  const filtered = search.trim()
    ? captions.filter(
        (c) =>
          c.text.toLowerCase().includes(search.trim().toLowerCase()) ||
          c.title?.toLowerCase().includes(search.trim().toLowerCase()),
      )
    : captions;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-md border border-om-border px-2 py-1 text-[10.5px] font-medium text-om-dim hover:border-om-blue/40 hover:text-om-text"
      >
        <Bookmark className="size-3" /> Saved captions{captions.length ? ` (${captions.length})` : ""}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="flex max-h-[70vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-om-border bg-om-bg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 border-b border-om-border p-3">
              <Search className="size-3.5 shrink-0 text-om-muted" />
              <input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search your saved captions…"
                className="flex-1 bg-transparent text-[12px] text-om-text outline-none placeholder:text-om-muted"
              />
              <button onClick={() => setOpen(false)} className="shrink-0 text-om-muted hover:text-om-text">
                <X className="size-4" />
              </button>
            </div>
            <div className="om-scroll flex-1 overflow-y-auto p-2">
              {isLoading ? (
                <p className="p-4 text-center text-[11.5px] text-om-muted">Loading…</p>
              ) : filtered.length === 0 ? (
                <p className="p-4 text-center text-[11.5px] text-om-muted">
                  {captions.length === 0
                    ? "No saved captions yet — write one in Content Studio → Copy, then hit Save."
                    : "Nothing matches that search."}
                </p>
              ) : (
                <div className="space-y-1.5">
                  {filtered.map((c) => {
                    const p = findPlatform(c.platform);
                    return (
                      <button
                        key={c.key}
                        onClick={() => {
                          onPick(c.text, c.hashtags);
                          setOpen(false);
                          setSearch("");
                        }}
                        className="block w-full rounded-lg border border-om-border bg-white/[0.02] p-2.5 text-left hover:border-om-blue/40"
                      >
                        <div className="mb-1 flex items-center gap-1.5 text-[9.5px] text-om-muted">
                          {p && <p.Icon className="size-3" style={{ color: p.color }} />}
                          <span className="capitalize">{c.platform || "any platform"}</span>
                          {c.angle && (
                            <span className="rounded bg-om-blue/12 px-1 py-px text-[9px] font-semibold text-om-blue">
                              {c.angle}
                            </span>
                          )}
                          <span className="ml-auto">{relativeTime(c.createdAt)}</span>
                        </div>
                        {c.title && (
                          <div className="mb-0.5 text-[12px] font-semibold text-om-text">{c.title}</div>
                        )}
                        <p className="text-[11.5px] leading-relaxed text-om-dim">{truncate(c.text, 160)}</p>
                        {c.hashtags.length > 0 && (
                          <p className="mt-1 text-[10px] text-om-blue">{c.hashtags.join(" ")}</p>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
