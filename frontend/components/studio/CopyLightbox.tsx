"use client";

import { useEffect, useState } from "react";
import { X, Copy, Check, PenSquare, Trash2, Hash } from "lucide-react";
import { toast } from "@/lib/om/toast";

export interface CaptionView {
  id: string;
  title: string;
  platform: string | null;
  text: string;
  hashtags: string[];
  angle?: string;
  createdAt: string;
}

export function CopyLightbox({
  caption,
  onClose,
  onUse,
  onDelete,
}: {
  caption: CaptionView;
  onClose: () => void;
  onUse: () => void;
  onDelete: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const full = caption.hashtags.length
    ? `${caption.text}\n\n${caption.hashtags.join(" ")}`
    : caption.text;

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
      className="fixed inset-0 z-[70] grid place-items-center bg-black/85 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[85vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-om-border-strong bg-om-bg2 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-om-border px-5 py-3.5">
          <div className="min-w-0">
            <div className="truncate text-[14px] font-semibold tracking-tight">
              {caption.title || "Caption"}
            </div>
            <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-om-muted">
              {caption.platform && <span className="capitalize">{caption.platform}</span>}
              {caption.angle && (
                <span className="rounded bg-om-blue/12 px-1.5 py-px text-[9.5px] font-semibold text-om-blue">
                  {caption.angle}
                </span>
              )}
              <span>·</span>
              <span>{caption.text.length} chars</span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="grid size-7 shrink-0 place-items-center rounded-lg text-om-muted transition-colors hover:bg-white/[0.06] hover:text-om-text"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="om-scroll flex-1 overflow-y-auto px-5 py-4">
          <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-om-text">{caption.text}</p>
          {caption.hashtags.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[11.5px] text-om-blue">
              <Hash className="size-3.5" />
              {caption.hashtags.map((h) => (
                <span key={h}>{h.replace(/^#/, "")}</span>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 border-t border-om-border px-5 py-3">
          <button
            onClick={onDelete}
            className="inline-flex items-center gap-1.5 rounded-lg border border-om-red/25 px-2.5 py-1.5 text-[11.5px] text-om-red hover:bg-om-red/10"
          >
            <Trash2 className="size-3.5" /> Delete
          </button>
          <button
            onClick={async () => {
              await navigator.clipboard.writeText(full);
              setCopied(true);
              toast.ok("Copied");
              setTimeout(() => setCopied(false), 1500);
            }}
            className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-om-border px-2.5 py-1.5 text-[11.5px] text-om-dim hover:text-om-text"
          >
            {copied ? <Check className="size-3.5 text-om-green" /> : <Copy className="size-3.5" />}
            Copy
          </button>
          <button
            onClick={onUse}
            className="inline-flex items-center gap-1.5 rounded-lg bg-om-blue px-2.5 py-1.5 text-[11.5px] font-medium text-white hover:bg-[#5c85ff]"
          >
            <PenSquare className="size-3.5" /> Use in post
          </button>
        </div>
      </div>
    </div>
  );
}
