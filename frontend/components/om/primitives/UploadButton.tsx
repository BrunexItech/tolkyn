"use client";

import { useRef, useState } from "react";
import { Loader2, Paperclip } from "lucide-react";
import { cn } from "@/lib/utils";
import { uploadFile, type Upload } from "@/lib/api/uploads";
import { toast } from "@/lib/om/toast";

interface UploadButtonProps {
  accept?: string;
  onUploaded: (u: Upload) => void;
  children?: React.ReactNode;
  className?: string;
}

/** File picker that uploads to /uploads and returns the stored Upload. */
export function UploadButton({ accept = "image/*", onUploaded, children, className }: UploadButtonProps) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const pick = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    try {
      onUploaded(await uploadFile(file));
    } catch (e) {
      toast.err((e as Error).message);
    } finally {
      setBusy(false);
      if (ref.current) ref.current.value = "";
    }
  };

  return (
    <>
      <input
        ref={ref}
        type="file"
        accept={accept}
        hidden
        onChange={(e) => pick(e.target.files?.[0])}
      />
      <button
        type="button"
        onClick={() => ref.current?.click()}
        disabled={busy}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-lg border border-om-border px-2.5 py-1.5 text-[11.5px] font-medium text-om-dim transition-colors hover:border-om-blue/50 hover:text-om-text disabled:opacity-50",
          className,
        )}
      >
        {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Paperclip className="size-3.5" />}
        {children ?? "Attach"}
      </button>
    </>
  );
}
