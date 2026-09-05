"use client";

import { useEffect } from "react";
import { X, Download, PenSquare, ExternalLink } from "lucide-react";

export function ImageLightbox({
  src,
  caption,
  onClose,
  onUse,
}: {
  src: string;
  caption?: string;
  onClose: () => void;
  onUse?: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[70] flex flex-col bg-black/90 backdrop-blur-sm"
      onClick={onClose}
    >
      <div className="flex items-center justify-end gap-2 p-3">
        <a
          href={src}
          download
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-2.5 py-1.5 text-[11.5px] text-white hover:bg-white/20"
        >
          <Download className="size-3.5" /> Download
        </a>
        <a
          href={src}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-2.5 py-1.5 text-[11.5px] text-white hover:bg-white/20"
        >
          <ExternalLink className="size-3.5" /> New tab
        </a>
        {onUse && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onUse();
            }}
            className="inline-flex items-center gap-1.5 rounded-lg bg-om-blue px-2.5 py-1.5 text-[11.5px] font-medium text-white hover:bg-[#5c85ff]"
          >
            <PenSquare className="size-3.5" /> Use in post
          </button>
        )}
        <button
          onClick={onClose}
          className="grid size-8 place-items-center rounded-lg bg-white/10 text-white hover:bg-white/20"
          aria-label="Close"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="flex flex-1 items-center justify-center overflow-auto px-4 pb-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={caption ?? ""}
          onClick={(e) => e.stopPropagation()}
          className="max-h-full max-w-full rounded-lg object-contain shadow-2xl"
          style={{ imageRendering: "auto" }}
        />
      </div>

      {caption && (
        <div className="mx-auto max-w-3xl px-4 pb-4 text-center text-[11px] leading-relaxed text-white/70">
          {caption}
        </div>
      )}
    </div>
  );
}
