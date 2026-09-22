"use client";

import { useQuery } from "@tanstack/react-query";
import { Loader2, MessageSquareText } from "lucide-react";
import { Modal } from "@/components/om/primitives/Modal";
import { callCenterApi } from "@/lib/api/callcenter";
import { mediaUrl } from "@/lib/api/video";
import { cn } from "@/lib/utils";

function formatTime(secs?: number | null): string {
  if (secs == null) return "";
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function CallTranscriptModal({
  callId,
  callerName,
  onClose,
}: {
  callId: string | null;
  callerName: string;
  onClose: () => void;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["call-center", "transcript", callId],
    queryFn: () => callCenterApi.transcript(callId as string),
    enabled: !!callId,
  });

  return (
    <Modal
      open={!!callId}
      onOpenChange={(v) => !v && onClose()}
      title={
        <span className="inline-flex items-center gap-1.5">
          <MessageSquareText className="size-3.5" /> Conversation with {callerName}
        </span>
      }
      description="What the AI agent and caller said, from ElevenLabs' own call record."
    >
      {isLoading ? (
        <div className="flex items-center gap-2 py-8 text-[12px] text-om-muted">
          <Loader2 className="size-4 animate-spin" /> Loading conversation…
        </div>
      ) : !data?.hasTranscript ? (
        <div className="py-8 text-center text-[12px] text-om-muted">
          No transcript for this call yet.
        </div>
      ) : (
        <div className="space-y-3">
          {data.audioUrl && (
            <audio controls className="w-full" src={mediaUrl(data.audioUrl)} />
          )}
          {data.summary && (
            <div className="rounded-md border border-om-border bg-white/[0.02] px-2.5 py-2 text-[11.5px] leading-relaxed text-om-dim">
              {data.summary}
            </div>
          )}
          <div className="space-y-2">
            {data.turns.map((t, i) => {
              const isAgent = t.role === "agent";
              return (
                <div
                  key={i}
                  className={cn("flex", isAgent ? "justify-start" : "justify-end")}
                >
                  <div
                    className={cn(
                      "max-w-[80%] rounded-xl px-3 py-1.5 text-[12px] leading-relaxed",
                      isAgent
                        ? "rounded-tl-sm bg-white/[0.06] text-om-text"
                        : "rounded-tr-sm bg-om-blue/20 text-om-text",
                    )}
                  >
                    <div className="mb-0.5 flex items-center gap-1.5 text-[9.5px] font-semibold uppercase tracking-wide text-om-muted">
                      {isAgent ? "AI agent" : "Caller"}
                      {t.timeInCallSecs != null && (
                        <span className="font-normal normal-case tabular-nums">
                          {formatTime(t.timeInCallSecs)}
                        </span>
                      )}
                    </div>
                    {t.message}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </Modal>
  );
}
