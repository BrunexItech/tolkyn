"use client";

import {
  Phone,
  MessageCircle,
  MessageSquare,
  Mail,
  CalendarClock,
  StickyNote,
  ArrowDownLeft,
  ArrowUpRight,
  Trash2,
  Loader2,
} from "lucide-react";
import { useConfirm } from "@/components/om/primitives/ConfirmDialog";
import { relativeTime, shortDateTime } from "@/lib/om/format";
import { cn } from "@/lib/utils";
import { useInteractions, useDeleteInteraction } from "./hooks";
import type { InteractionKind } from "@/lib/api/crm";

const META: Record<InteractionKind, { label: string; icon: typeof Phone; color: string }> = {
  call: { label: "Call", icon: Phone, color: "var(--om-blue)" },
  whatsapp: { label: "WhatsApp", icon: MessageCircle, color: "#25D366" },
  sms: { label: "SMS", icon: MessageSquare, color: "var(--om-cyan)" },
  email: { label: "Email", icon: Mail, color: "var(--om-violet)" },
  meeting: { label: "Meeting", icon: CalendarClock, color: "var(--om-amber)" },
  note: { label: "Note", icon: StickyNote, color: "var(--om-muted)" },
};

export function InteractionTimeline({
  customerId,
  lastContactAt,
}: {
  customerId: string;
  lastContactAt?: string | null;
}) {
  const { data, isLoading } = useInteractions(customerId);
  const del = useDeleteInteraction();
  const { confirm, dialog } = useConfirm();
  const items = data?.items ?? [];

  const onDelete = async (interactionId: string, label: string) => {
    const ok = await confirm({
      title: "Delete this entry?",
      message: `The ${label.toLowerCase()} will be removed from the timeline.`,
      confirmLabel: "Delete",
      danger: true,
    });
    if (ok) del.mutate({ id: customerId, interactionId });
  };

  return (
    <div>
      <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-om-faint">
        Activity {items.length > 0 && <span className="text-om-muted">· {items.length}</span>}
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 py-3 text-[11.5px] text-om-muted">
          <Loader2 className="size-3.5 animate-spin" /> Loading…
        </div>
      ) : items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-om-border px-3 py-3 text-[11.5px] text-om-muted">
          {lastContactAt ? (
            <>
              Last contacted {relativeTime(lastContactAt)} — earlier touchpoints weren&rsquo;t logged
              in detail. New ones will show here.
            </>
          ) : (
            <>
              No contact logged yet. Use <span className="text-om-dim">Log contact</span> below after
              a call, message or meeting.
            </>
          )}
        </p>
      ) : (
        <ol className="relative space-y-2.5 border-l border-om-border pl-4">
          {items.map((it) => {
            const m = META[it.kind];
            return (
              <li key={it.id} className="group relative">
                <span
                  className="absolute -left-[22px] top-0.5 grid size-4 place-items-center rounded-full border border-om-border bg-om-bg2"
                  style={{ color: m.color }}
                >
                  <m.icon className="size-2.5" />
                </span>
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 text-[11.5px] font-medium text-om-dim">
                      {m.label}
                      {it.direction && (
                        <span className="inline-flex items-center gap-0.5 text-[9.5px] text-om-faint">
                          {it.direction === "in" ? (
                            <>
                              <ArrowDownLeft className="size-2.5" /> inbound
                            </>
                          ) : (
                            <>
                              <ArrowUpRight className="size-2.5" /> outbound
                            </>
                          )}
                        </span>
                      )}
                      <span
                        className="ml-auto shrink-0 text-[9.5px] font-normal text-om-faint"
                        title={shortDateTime(it.occurred_at)}
                      >
                        {relativeTime(it.occurred_at)}
                      </span>
                    </div>
                    {it.note && (
                      <p className="mt-0.5 whitespace-pre-wrap text-[11.5px] leading-relaxed text-om-muted">
                        {it.note}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => onDelete(it.id, m.label)}
                    className={cn(
                      "shrink-0 text-om-faint opacity-0 transition-opacity hover:text-om-red group-hover:opacity-100",
                    )}
                    aria-label="Delete entry"
                  >
                    <Trash2 className="size-3" />
                  </button>
                </div>
              </li>
            );
          })}
        </ol>
      )}
      {dialog}
    </div>
  );
}
