"use client";

import { Heart, MessageCircle, Repeat2, Send, MoreHorizontal, ThumbsUp, Music2 } from "lucide-react";
import { Card, CardTitle } from "@/components/om/primitives/Card";
import { EmptyState } from "@/components/om/primitives/EmptyState";
import { PlatformGlyph } from "@/components/om/primitives/PlatformChip";
import { platform as findPlatform } from "@/lib/om/platforms";
import { useSession } from "@/components/om/session";
import type { DraftForm } from "./useComposerDraft";

export function PreviewPane({ form }: { form: DraftForm }) {
  const { user } = useSession();
  const bodyWithTags = [form.body.trim(), form.hashtags.join(" ")].filter(Boolean).join("\n\n");

  return (
    <Card>
      <CardTitle>Preview</CardTitle>
      {form.platforms.length === 0 ? (
        <EmptyState title="Pick a platform to preview how this post will look" />
      ) : (
        <div className="space-y-3">
          {form.platforms.map((pid) => {
            const p = findPlatform(pid);
            if (!p) return null;
            return (
              <div key={pid} className="rounded-xl border border-om-border bg-white/[0.02] p-3">
                <div className="mb-2 flex items-center gap-2">
                  <PlatformGlyph platform={p} size={26} />
                  <div className="min-w-0">
                    <div className="text-[11.5px] font-semibold">{user.name}</div>
                    <div className="truncate text-[9.5px] text-om-muted">
                      {p.handle} · just now
                    </div>
                  </div>
                  <MoreHorizontal className="ml-auto size-3.5 text-om-faint" />
                </div>

                {form.title && pid === "youtube" && (
                  <div className="mb-1 text-[12px] font-semibold">{form.title}</div>
                )}

                <p className="whitespace-pre-wrap text-[11.5px] leading-relaxed text-om-dim">
                  {bodyWithTags || <span className="text-om-faint">Your text will appear here…</span>}
                </p>

                {form.link && (
                  <div className="mt-2 truncate rounded-md border border-om-border bg-white/[0.02] px-2 py-1.5 text-[10.5px] text-om-blue">
                    {form.link}
                  </div>
                )}

                {form.media.length > 0 && (
                  <div className="mt-2 grid grid-cols-2 gap-1">
                    {form.media.slice(0, 4).map((m, i) => (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        key={i}
                        src={m.url}
                        alt={m.alt}
                        className="aspect-square w-full rounded-md border border-om-border object-cover"
                      />
                    ))}
                  </div>
                )}

                {form.music && (
                  <div className="mt-2 flex items-center gap-1.5 rounded-md border border-om-border bg-white/[0.02] px-2 py-1 text-[10px] text-om-dim">
                    <Music2 className="size-3 text-om-violet" />
                    <span className="truncate">{form.music.title || "Original audio"}</span>
                  </div>
                )}

                <div className="mt-2.5 flex items-center gap-4 text-om-faint">
                  {pid === "x" || pid === "linkedin" ? (
                    <>
                      <MessageCircle className="size-3.5" />
                      <Repeat2 className="size-3.5" />
                      <Heart className="size-3.5" />
                      <Send className="size-3.5" />
                    </>
                  ) : pid === "facebook" || pid === "linkedin" ? (
                    <>
                      <ThumbsUp className="size-3.5" />
                      <MessageCircle className="size-3.5" />
                      <Send className="size-3.5" />
                    </>
                  ) : (
                    <>
                      <Heart className="size-3.5" />
                      <MessageCircle className="size-3.5" />
                      <Send className="size-3.5" />
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
