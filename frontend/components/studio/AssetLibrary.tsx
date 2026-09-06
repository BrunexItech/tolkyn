"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Library, Trash2, Type, Image as ImageIcon, Clapperboard, Maximize2, Hash } from "lucide-react";
import { Card, CardTitle } from "@/components/om/primitives/Card";
import { EmptyState } from "@/components/om/primitives/EmptyState";
import { useConfirm } from "@/components/om/primitives/ConfirmDialog";
import { useAssets, useDeleteAsset } from "./hooks";
import { ImageLightbox } from "./ImageLightbox";
import { CopyLightbox, type CaptionView } from "./CopyLightbox";
import { mediaUrl, type AssetKind, type GeneratedAsset } from "@/lib/api/studio";
import { relativeTime, truncate } from "@/lib/om/format";

const ICON: Record<AssetKind, typeof Type> = {
  copy: Type,
  image: ImageIcon,
  video_plan: Clapperboard,
};

const HEADING: Record<AssetKind, string> = {
  copy: "Saved captions",
  image: "Recent images",
  video_plan: "Recent generations",
};

const EMPTY_TITLE: Record<AssetKind, string> = {
  copy: "No saved captions yet",
  image: "No images yet",
  video_plan: "Nothing generated yet",
};

function asCaption(a: GeneratedAsset): CaptionView {
  const p = (a.payload ?? {}) as { text?: string; hashtags?: string[]; angle?: string };
  return {
    id: a.id,
    title: a.title || "",
    platform: a.platform,
    text: p.text || a.prompt || "",
    hashtags: Array.isArray(p.hashtags) ? p.hashtags : [],
    angle: p.angle,
    createdAt: a.created_at,
  };
}

export function AssetLibrary({ kind }: { kind: AssetKind }) {
  const { data, isLoading } = useAssets(kind);
  const del = useDeleteAsset();
  const { confirm, dialog } = useConfirm();
  const router = useRouter();
  const assets = data?.items ?? [];
  const [lightbox, setLightbox] = useState<{ src: string; caption: string } | null>(null);
  const [openCaption, setOpenCaption] = useState<CaptionView | null>(null);

  const askDelete = async (id: string, label: string) => {
    const ok = await confirm({
      title: `Delete ${label}?`,
      message: "It will be removed from your library.",
      confirmLabel: "Delete",
      danger: true,
    });
    if (ok) del.mutate(id);
  };

  const useImageInComposer = (url: string) => {
    try {
      sessionStorage.setItem(
        "om:composer:prefill",
        JSON.stringify({ media: [{ url, alt: "", type: "image" }] }),
      );
    } catch {
      /* ignore */
    }
    router.push("/dashboard/publishing");
  };

  const useCaptionInComposer = (c: CaptionView) => {
    try {
      sessionStorage.setItem(
        "om:composer:prefill",
        JSON.stringify({
          body: c.text,
          hashtags: c.hashtags,
          platforms: c.platform ? [c.platform] : [],
        }),
      );
    } catch {
      /* ignore */
    }
    router.push("/dashboard/publishing");
  };

  const isCopy = kind === "copy";

  return (
    <Card>
      <CardTitle icon={<Library />}>{HEADING[kind]}</CardTitle>
      {isLoading ? (
        <EmptyState loading title="Loading…" />
      ) : assets.length === 0 ? (
        <EmptyState title={EMPTY_TITLE[kind]} />
      ) : isCopy ? (
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {assets.map((a) => {
            const c = asCaption(a);
            return (
              <button
                key={a.id}
                onClick={() => setOpenCaption(c)}
                className="group relative flex h-full flex-col rounded-lg border border-om-border bg-white/[0.02] p-2.5 text-left transition-colors hover:border-om-blue/40 hover:bg-white/[0.04]"
              >
                <div className="mb-1 flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wide text-om-muted">
                  <Type className="size-2.5" />
                  {c.platform || "caption"}
                  {c.angle ? ` · ${c.angle}` : ""}
                </div>
                <p className="line-clamp-5 whitespace-pre-wrap text-[11.5px] leading-relaxed text-om-dim">
                  {c.text}
                </p>
                {c.hashtags.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap items-center gap-1 text-[9.5px] text-om-blue/80">
                    <Hash className="size-2.5" />
                    {c.hashtags.slice(0, 6).map((h) => (
                      <span key={h}>{h.replace(/^#/, "")}</span>
                    ))}
                  </div>
                )}
                <div className="mt-auto flex items-center gap-1.5 pt-2 text-[9px] text-om-faint">
                  <span className="truncate">{c.title || "Untitled"}</span>
                  <span className="ml-auto shrink-0">{relativeTime(c.createdAt)}</span>
                </div>
                <span
                  onClick={(e) => {
                    e.stopPropagation();
                    askDelete(a.id, "caption");
                  }}
                  className="absolute right-1 top-1 grid size-6 place-items-center rounded-md bg-black/40 text-om-muted opacity-0 transition-opacity hover:text-om-red group-hover:opacity-100"
                >
                  <Trash2 className="size-3" />
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {assets.map((a) => {
            const Icon = ICON[a.kind];
            const img = a.kind === "image" && a.image_url ? mediaUrl(a.image_url) : null;
            return (
              <div
                key={a.id}
                className="group relative overflow-hidden rounded-lg border border-om-border bg-white/[0.02]"
              >
                {img ? (
                  <button
                    onClick={() => setLightbox({ src: img, caption: a.title || a.prompt })}
                    className="block w-full cursor-zoom-in"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={img} alt="" className="aspect-video w-full object-cover" />
                    <span className="absolute left-1.5 top-1.5 grid size-6 place-items-center rounded-md bg-black/55 text-white opacity-0 transition-opacity group-hover:opacity-100">
                      <Maximize2 className="size-3" />
                    </span>
                  </button>
                ) : (
                  <div className="flex aspect-video items-center justify-center bg-white/[0.02]">
                    <Icon className="size-5 text-om-faint" />
                  </div>
                )}
                <div className="p-2">
                  <div className="flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wide text-om-muted">
                    <Icon className="size-2.5" />
                    {a.kind.replace("_", " ")}
                    {a.platform ? ` · ${a.platform}` : ""}
                  </div>
                  <div className="mt-0.5 text-[10.5px] text-om-dim">{truncate(a.title || a.prompt, 60)}</div>
                  <div className="mt-0.5 text-[9px] text-om-faint">{relativeTime(a.created_at)}</div>
                </div>
                <button
                  onClick={() => askDelete(a.id, a.kind === "image" ? "image" : "item")}
                  className="absolute right-1 top-1 grid size-6 place-items-center rounded-md bg-black/50 text-om-muted opacity-0 transition-opacity hover:text-om-red group-hover:opacity-100"
                >
                  <Trash2 className="size-3" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {dialog}

      {lightbox && (
        <ImageLightbox
          src={lightbox.src}
          caption={lightbox.caption}
          onClose={() => setLightbox(null)}
          onUse={() => {
            const s = lightbox.src;
            setLightbox(null);
            useImageInComposer(s);
          }}
        />
      )}

      {openCaption && (
        <CopyLightbox
          caption={openCaption}
          onClose={() => setOpenCaption(null)}
          onUse={() => {
            useCaptionInComposer(openCaption);
          }}
          onDelete={() => {
            const id = openCaption.id;
            setOpenCaption(null);
            askDelete(id, "caption");
          }}
        />
      )}
    </Card>
  );
}
