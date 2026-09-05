"use client";

import { useEffect, useState } from "react";
import { Phone, MessageCircle, MessageSquare, Mail, CalendarClock, StickyNote, Loader2 } from "lucide-react";
import { Modal } from "@/components/om/primitives/Modal";
import { OmButton } from "@/components/om/primitives/OmButton";
import { cn } from "@/lib/utils";
import { useLogContact } from "./hooks";
import type { InteractionKind } from "@/lib/api/crm";

const KINDS: { id: InteractionKind; label: string; icon: typeof Phone; hasDirection: boolean }[] = [
  { id: "call", label: "Call", icon: Phone, hasDirection: true },
  { id: "whatsapp", label: "WhatsApp", icon: MessageCircle, hasDirection: true },
  { id: "sms", label: "SMS", icon: MessageSquare, hasDirection: true },
  { id: "email", label: "Email", icon: Mail, hasDirection: true },
  { id: "meeting", label: "Meeting", icon: CalendarClock, hasDirection: false },
  { id: "note", label: "Note", icon: StickyNote, hasDirection: false },
];

function localNow() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

export function LogContactDialog({
  customerId,
  customerName,
  open,
  onOpenChange,
}: {
  customerId: string | null;
  customerName?: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const log = useLogContact();
  const [kind, setKind] = useState<InteractionKind>("call");
  const [direction, setDirection] = useState<"in" | "out">("out");
  const [note, setNote] = useState("");
  const [when, setWhen] = useState(localNow());

  useEffect(() => {
    if (open) {
      setKind("call");
      setDirection("out");
      setNote("");
      setWhen(localNow());
    }
  }, [open]);

  const cfg = KINDS.find((k) => k.id === kind)!;

  const submit = async () => {
    if (!customerId) return;
    await log.mutateAsync({
      id: customerId,
      kind,
      direction: cfg.hasDirection ? direction : null,
      note: note.trim() || undefined,
      occurred_at: when ? new Date(when).toISOString() : undefined,
    });
    onOpenChange(false);
  };

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Log contact"
      description={customerName ? `Record a touchpoint with ${customerName}` : undefined}
      footer={
        <>
          <OmButton variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </OmButton>
          <OmButton variant="solid" size="md" onClick={submit} disabled={log.isPending}>
            {log.isPending ? <Loader2 className="animate-spin" /> : <cfg.icon />}
            Log {cfg.label.toLowerCase()}
          </OmButton>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <div className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.05em] text-om-muted">
            Type
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {KINDS.map((k) => (
              <button
                key={k.id}
                onClick={() => setKind(k.id)}
                className={cn(
                  "flex items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-[11.5px] font-medium transition-colors",
                  kind === k.id
                    ? "border-om-blue/50 bg-om-blue/10 text-om-blue"
                    : "border-om-border text-om-muted hover:text-om-dim",
                )}
              >
                <k.icon className="size-3.5" />
                {k.label}
              </button>
            ))}
          </div>
        </div>

        {cfg.hasDirection && (
          <div>
            <div className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.05em] text-om-muted">
              Direction
            </div>
            <div className="flex gap-1.5">
              {(["out", "in"] as const).map((d) => (
                <button
                  key={d}
                  onClick={() => setDirection(d)}
                  className={cn(
                    "flex-1 rounded-lg border px-3 py-1.5 text-[11.5px] font-medium transition-colors",
                    direction === d
                      ? "border-om-blue/50 bg-om-blue/10 text-om-blue"
                      : "border-om-border text-om-muted hover:text-om-dim",
                  )}
                >
                  {d === "out" ? "We reached out" : "They contacted us"}
                </button>
              ))}
            </div>
          </div>
        )}

        <div>
          <div className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.05em] text-om-muted">
            When
          </div>
          <input
            type="datetime-local"
            value={when}
            max={localNow()}
            onChange={(e) => setWhen(e.target.value)}
            className="w-full rounded-lg border border-om-border bg-white/[0.03] px-2.5 py-2 text-[12px] text-om-text outline-none focus:border-om-blue/60 [color-scheme:dark]"
          />
        </div>

        <div>
          <div className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.05em] text-om-muted">
            Note {kind === "note" ? "" : "(optional)"}
          </div>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder="What was discussed? Any next steps?"
            className="w-full rounded-lg border border-om-border bg-white/[0.03] px-2.5 py-2 text-[12.5px] leading-relaxed text-om-text outline-none placeholder:text-om-muted focus:border-om-blue/60"
          />
        </div>
      </div>
    </Modal>
  );
}
