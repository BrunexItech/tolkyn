"use client";

import { useState } from "react";
import { Send, Trash2, ChevronRight, CheckCheck, TriangleAlert } from "lucide-react";
import { Card, CardTitle } from "@/components/om/primitives/Card";
import { EmptyState } from "@/components/om/primitives/EmptyState";
import { StatusBadge, type BadgeTone } from "@/components/om/primitives/StatusBadge";
import { OmButton } from "@/components/om/primitives/OmButton";
import { useConfirm } from "@/components/om/primitives/ConfirmDialog";
import { useBroadcasts, useSendBroadcast, useDeleteBroadcast } from "./hooks";
import type { BroadcastChannel, BroadcastStatus } from "@/lib/api/messaging";
import { relativeTime } from "@/lib/om/format";
import { cn } from "@/lib/utils";

const TONE: Record<BroadcastStatus, BadgeTone> = {
  draft: "muted",
  sending: "amber",
  sent: "green",
  partial: "amber",
  failed: "red",
};

export function BroadcastHistory({ channel, accent }: { channel: BroadcastChannel; accent: string }) {
  const { data } = useBroadcasts(channel);
  const send = useSendBroadcast();
  const del = useDeleteBroadcast();
  const { confirm, dialog } = useConfirm();
  const [open, setOpen] = useState<string | null>(null);
  const items = data?.items ?? [];

  const onDelete = async (id: string, name: string) => {
    const ok = await confirm({
      title: "Delete broadcast?",
      message: (
        <>
          <strong className="text-om-text">{name}</strong> and its delivery record will be removed.
        </>
      ),
      confirmLabel: "Delete",
      danger: true,
    });
    if (ok) del.mutate(id);
  };

  return (
    <Card className="space-y-2">
      <CardTitle icon={<Send />} color={accent}>
        History
      </CardTitle>
      {items.length === 0 ? (
        <EmptyState title="Nothing sent yet">Your broadcasts on this channel show up here.</EmptyState>
      ) : (
        <div className="space-y-1.5">
          {items.map((b) => {
            const expanded = open === b.id;
            return (
              <div key={b.id} className="rounded-lg border border-om-border bg-white/[0.02]">
                <button
                  onClick={() => setOpen(expanded ? null : b.id)}
                  className="flex w-full items-center gap-2 px-2.5 py-2 text-left"
                >
                  <ChevronRight
                    className={cn("size-3.5 shrink-0 text-om-muted transition-transform", expanded && "rotate-90")}
                  />
                  <span className="flex-1 truncate text-[12px] font-medium text-om-dim">{b.name}</span>
                  <StatusBadge tone={TONE[b.status]}>{b.status}</StatusBadge>
                  <span className="font-mono text-[10px] text-om-faint">
                    {b.status === "draft" ? `${b.total} rcpt` : `${b.sent_count}/${b.total}`}
                  </span>
                </button>

                {expanded && (
                  <div className="space-y-2 border-t border-om-border px-2.5 py-2 text-[11px]">
                    <p className="whitespace-pre-wrap text-om-muted">{b.body || "(no message)"}</p>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-om-faint">
                      <span>{b.total} recipients</span>
                      {b.status !== "draft" && (
                        <>
                          <span className="flex items-center gap-1 text-om-green">
                            <CheckCheck className="size-3" /> {b.sent_count} delivered
                          </span>
                          {b.failed_count > 0 && (
                            <span className="flex items-center gap-1 text-om-red">
                              <TriangleAlert className="size-3" /> {b.failed_count} failed
                            </span>
                          )}
                        </>
                      )}
                      {b.sent_at && <span>{relativeTime(b.sent_at)}</span>}
                    </div>
                    {b.simulated === 1 && b.status !== "draft" && (
                      <p className="rounded-md bg-om-amber/10 px-2 py-1 text-[10px] text-om-amber">
                        Test mode — these messages were not actually delivered.
                      </p>
                    )}

                    {b.failed_count > 0 && b.results.some((r) => !r.ok) && (
                      <div className="rounded-md border border-om-red/20 bg-om-red/[0.05]">
                        <div className="border-b border-om-red/15 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-om-red">
                          Failed deliveries
                        </div>
                        <div className="om-scroll max-h-40 divide-y divide-om-red/10 overflow-y-auto">
                          {b.results
                            .filter((r) => !r.ok)
                            .map((r, i) => (
                              <div key={`${r.phone}-${i}`} className="flex items-baseline gap-2 px-2 py-1">
                                <span className="shrink-0 font-mono text-[10px] text-om-dim">{r.phone}</span>
                                <span className="min-w-0 flex-1 truncate text-[10px] text-om-faint">
                                  {r.error || "delivery failed"}
                                </span>
                              </div>
                            ))}
                        </div>
                      </div>
                    )}
                    <div className="flex items-center gap-2 pt-0.5">
                      {(b.status === "draft" || b.status === "failed" || b.status === "partial") && (
                        <OmButton
                          variant="subtle"
                          size="xs"
                          onClick={() => send.mutate(b.id)}
                          disabled={send.isPending}
                        >
                          <Send /> {b.status === "draft" ? "Send now" : "Retry"}
                        </OmButton>
                      )}
                      <OmButton
                        variant="ghost"
                        size="xs"
                        className="ml-auto"
                        onClick={() => onDelete(b.id, b.name)}
                      >
                        <Trash2 /> Delete
                      </OmButton>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {dialog}
    </Card>
  );
}
