"use client";

import { useRef, useState } from "react";
import { Loader2, Paperclip, Palette, X } from "lucide-react";
import { Card } from "@/components/om/primitives/Card";
import { uploadFile } from "@/lib/api/uploads";
import { mediaUrl } from "@/lib/api/studio";
import { extractDominantColors } from "@/lib/om/colorExtract";
import { useBrandKit, useSetBrandKit, useClearBrandKit } from "./hooks";
import { toast } from "@/lib/om/toast";

/** Workspace brand logo + colours. Set once here (or on the AI Video page —
 * same kit) and the logo gets composited onto generated images exactly where
 * the prompt asks for it. A transparent PNG works best. */
export function StudioBrandBar() {
  const { data: kit } = useBrandKit();
  const setBrand = useSetBrandKit();
  const clearBrand = useClearBrandKit();
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
        colors = [];
      }
      setBrand.mutate({ logoUrl: u.url, colors });
    } catch (e) {
      toast.err((e as Error).message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  if (!kit) return null;

  return (
    <Card noEdge className="p-3">
      <input ref={fileRef} type="file" accept="image/png,image/webp,image/svg+xml,image/jpeg" hidden onChange={(e) => pick(e.target.files?.[0])} />
      {kit.brand_logo_url ? (
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={mediaUrl(kit.brand_logo_url)}
            alt=""
            className="size-10 shrink-0 rounded-md border border-om-border bg-white/5 object-contain p-1"
          />
          <div className="min-w-0 flex-1">
            <div className="text-[12px] font-semibold text-om-text">Brand logo is on</div>
            <div className="text-[10.5px] text-om-muted">
              Say where in your prompt — &ldquo;logo top-right&rdquo; for a corner, or &ldquo;our logo on the
              laptop lid&rdquo; to place it on an object in the scene.
            </div>
          </div>
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="rounded-md px-2 py-1 text-[10.5px] font-medium text-om-blue hover:bg-om-blue/10 disabled:opacity-50"
          >
            {uploading ? <Loader2 className="inline size-3 animate-spin" /> : "Change"}
          </button>
          <button
            onClick={() => clearBrand.mutate()}
            disabled={clearBrand.isPending}
            title="Remove brand logo"
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
              A transparent PNG works best. Then just say where you want it in your prompt and it&apos;s
              placed there — exact, not redrawn by the AI.
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
