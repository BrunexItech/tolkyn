"use client";

import { useState } from "react";
import { Hash, Link2, ImagePlus, X, Loader2, Check, Sparkles, Music2 } from "lucide-react";
import { Card, CardTitle } from "@/components/om/primitives/Card";
import { OmInput } from "@/components/om/primitives/Field";
import { UploadButton } from "@/components/om/primitives/UploadButton";
import { mediaUrl } from "@/lib/api/uploads";
import { SavedCaptionsPicker } from "./SavedCaptionsPicker";
import { toast } from "@/lib/om/toast";
import type { DraftForm } from "./useComposerDraft";

export function ComposerEditor({
  form,
  patch,
  saving,
  saved,
}: {
  form: DraftForm;
  patch: (p: Partial<DraftForm>) => void;
  saving: boolean;
  saved: boolean;
}) {
  const [tagInput, setTagInput] = useState("");
  const [mediaUrlInput, setMediaUrlInput] = useState("");

  const addTag = () => {
    const t = tagInput.trim().replace(/^#/, "");
    if (t && !form.hashtags.includes(`#${t}`)) patch({ hashtags: [...form.hashtags, `#${t}`] });
    setTagInput("");
  };

  const addMedia = () => {
    const u = mediaUrlInput.trim();
    if (!u) return;
    const type = /\.(mp4|mov|webm)$/i.test(u) ? "video" : "image";
    patch({ media: [...form.media, { url: u, alt: "", type }] });
    setMediaUrlInput("");
  };

  const needsTitle = form.platforms.includes("youtube");

  return (
    <Card>
      <CardTitle
        icon={<Sparkles />}
        action={
          <span className="flex items-center gap-1 text-[10px] text-om-muted">
            {saving ? (
              <>
                <Loader2 className="size-3 animate-spin" /> Saving…
              </>
            ) : saved ? (
              <>
                <Check className="size-3 text-om-green" /> Draft saved
              </>
            ) : null}
          </span>
        }
      >
        Compose
      </CardTitle>

      {needsTitle && (
        <div className="mb-2.5">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.06em] text-om-muted">
            Title (YouTube)
          </div>
          <OmInput value={form.title} onChange={(e) => patch({ title: e.target.value })} placeholder="Video title" />
        </div>
      )}

      <div className="mb-1.5 flex items-center justify-end">
        <SavedCaptionsPicker
          onPick={(body, hashtags) => {
            patch({ body, hashtags });
            toast.ok("Caption inserted");
          }}
        />
      </div>
      <textarea
        value={form.body}
        onChange={(e) => patch({ body: e.target.value })}
        rows={6}
        placeholder="Write your post…"
        className="w-full rounded-lg border border-om-border bg-white/[0.03] px-3 py-2.5 text-[12.5px] leading-relaxed text-om-text outline-none focus:border-om-blue/60 focus:ring-2 focus:ring-om-blue/15"
      />

      {/* hashtags */}
      <div className="mt-2.5">
        <div className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.06em] text-om-muted">
          <Hash className="size-3" /> Hashtags
        </div>
        <div className="flex flex-wrap items-center gap-1">
          {form.hashtags.map((h) => (
            <span
              key={h}
              className="flex items-center gap-1 rounded-md bg-om-blue/12 px-1.5 py-0.5 text-[10.5px] text-om-blue"
            >
              {h}
              <button onClick={() => patch({ hashtags: form.hashtags.filter((x) => x !== h) })}>
                <X className="size-2.5" />
              </button>
            </span>
          ))}
          <input
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => (e.key === "Enter" || e.key === ",") && (e.preventDefault(), addTag())}
            placeholder="add tag"
            className="w-24 bg-transparent text-[11px] text-om-text outline-none placeholder:text-om-muted"
          />
        </div>
      </div>

      {/* link + media */}
      <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
        <div>
          <div className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.06em] text-om-muted">
            <Link2 className="size-3" /> Link
          </div>
          <OmInput
            value={form.link}
            onChange={(e) => patch({ link: e.target.value })}
            placeholder="https://…"
            className="text-[11.5px]"
          />
        </div>
        <div>
          <div className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.06em] text-om-muted">
            <ImagePlus className="size-3" /> Media
          </div>
          <div className="flex gap-1">
            <UploadButton
              accept="image/*,video/*"
              onUploaded={(u) =>
                patch({
                  media: [
                    ...form.media,
                    { url: mediaUrl(u.url), alt: "", type: u.kind === "video" ? "video" : "image" },
                  ],
                })
              }
              className="flex-1 justify-center"
            >
              Upload file
            </UploadButton>
            <button
              onClick={addMedia}
              title="Add by URL"
              className="shrink-0 rounded-lg border border-om-border px-2 text-om-muted hover:text-om-text"
            >
              <Link2 className="size-3.5" />
            </button>
          </div>
          <OmInput
            value={mediaUrlInput}
            onChange={(e) => setMediaUrlInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addMedia()}
            placeholder="…or paste an image / video URL"
            className="mt-1 text-[11px]"
          />
        </div>
      </div>

      {/* music */}
      <div className="mt-2.5">
        <div className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.06em] text-om-muted">
          <Music2 className="size-3" /> Music
        </div>
        {form.music ? (
          <div className="flex items-center gap-2 rounded-lg border border-om-border bg-white/[0.02] px-2.5 py-1.5">
            <Music2 className="size-3.5 text-om-violet" />
            <span className="flex-1 truncate text-[11px] text-om-dim">
              {form.music.title || "Audio track"}
            </span>
            <audio src={form.music.url} controls className="h-6 w-40" />
            <button onClick={() => patch({ music: null })} className="text-om-muted hover:text-om-red">
              <X className="size-3.5" />
            </button>
          </div>
        ) : (
          <UploadButton
            accept="audio/*"
            onUploaded={(u) => patch({ music: { url: mediaUrl(u.url), title: u.filename || "" } })}
          >
            Attach a track
          </UploadButton>
        )}
      </div>

      {form.media.length > 0 && (
        <div className="mt-2 grid grid-cols-4 gap-1.5">
          {form.media.map((m, i) => (
            <div key={i} className="group relative overflow-hidden rounded-md border border-om-border">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={m.url} alt="" className="aspect-square w-full object-cover" />
              <button
                onClick={() => patch({ media: form.media.filter((_, j) => j !== i) })}
                className="absolute right-1 top-1 grid size-5 place-items-center rounded bg-black/60 text-white opacity-0 group-hover:opacity-100"
              >
                <X className="size-3" />
              </button>
              <input
                value={m.alt}
                onChange={(e) =>
                  patch({
                    media: form.media.map((mm, j) => (j === i ? { ...mm, alt: e.target.value } : mm)),
                  })
                }
                placeholder="alt text"
                className="w-full bg-white/[0.03] px-1 py-0.5 text-[9px] text-om-text outline-none placeholder:text-om-faint"
              />
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
