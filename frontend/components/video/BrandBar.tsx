"use client";

import { useRef, useState } from "react";
import { Loader2, Paperclip, Palette, X } from "lucide-react";
import { Card } from "@/components/om/primitives/Card";
import { uploadFile } from "@/lib/api/uploads";
import { mediaUrl } from "@/lib/api/video";
import { extractDominantColors } from "@/lib/om/colorExtract";
import { useVideoModels, useSetBrand, useClearBrand } from "./hooks";
import { toast } from "@/lib/om/toast";

/** Persistent, account-level brand identity — set once, applied automatically
 * to every video generated afterward (color guidance in the prompt + a
 * corner watermark composited onto the finished clip). This is deliberately
 * separate from the per-generation "starting frame" reference image. */
export function BrandBar() {
  const { data: models } = useVideoModels();
  const setBrand = useSetBrand();
  const clearBrand = useClearBrand();
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const pick = async (file?: File) => {
    if (!file) return;
    setUploading(true);
    try {
      const u = await uploadFile(file);
      let colors: string[] = [];
      try {
        colors = await extractDominantColors(mediaUrl(u.url), 4);
      } catch {
        colors = []; // extraction is a nice-to-have, never block on it
      }
      setBrand.mutate({ logoUrl: u.url, colors });
    } catch (e) {
      toast.err((e as Error).message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  if (!models) return null;

  return (
    <Card noEdge className="p-3">
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => pick(e.target.files?.[0])} />
      {models.brand_logo_url ? (
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={mediaUrl(models.brand_logo_url)} alt="" className="size-10 shrink-0 rounded-md border border-om-border object-cover" />
          <div className="min-w-0 flex-1">
            <div className="text-[12px] font-semibold text-om-text">Brand is on</div>
            <div className="text-[10.5px] text-om-muted">Every video gets a corner watermark and color-matched styling</div>
            {models.brand_colors && models.brand_colors.length > 0 && (
              <div className="mt-1 flex gap-1">
                {models.brand_colors.map((c) => (
                  <span key={c} className="size-3 rounded-full border border-white/10" style={{ background: c }} title={c} />
                ))}
              </div>
            )}
          </div>
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="rounded-md px-2 py-1 text-[10.5px] font-medium text-om-violet hover:bg-om-violet/10 disabled:opacity-50"
          >
            {uploading ? <Loader2 className="inline size-3 animate-spin" /> : "Change"}
          </button>
          <button
            onClick={() => clearBrand.mutate()}
            disabled={clearBrand.isPending}
            title="Remove brand"
            className="grid size-7 shrink-0 place-items-center rounded-md text-om-muted hover:bg-om-red/10 hover:text-om-red"
          >
            <X className="size-3.5" />
          </button>
        </div>
      ) : (
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="flex w-full items-center gap-3 text-left disabled:opacity-50"
        >
          <span className="grid size-10 shrink-0 place-items-center rounded-md border border-dashed border-om-border text-om-muted">
            {uploading ? <Loader2 className="size-4 animate-spin" /> : <Palette className="size-4" />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[12px] font-semibold text-om-text">Add your brand logo</span>
            <span className="block text-[10.5px] text-om-muted">
              Every video afterward gets a corner watermark and colors matched to your brand — set once, applies automatically
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-1 rounded-md border border-om-border px-2 py-1 text-[10.5px] text-om-dim">
            <Paperclip className="size-3" /> Attach
          </span>
        </button>
      )}
    </Card>
  );
}
