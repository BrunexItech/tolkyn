"use client";

import { useMemo, useState } from "react";
import { Send, Loader2, Save } from "lucide-react";
import { Card, CardTitle } from "@/components/om/primitives/Card";
import { OmButton } from "@/components/om/primitives/OmButton";
import { Field, OmInput } from "@/components/om/primitives/Field";
import { RecipientPicker } from "./RecipientPicker";
import { useCreateBroadcast, useSendBroadcast } from "./hooks";
import type { BroadcastChannel, BroadcastRecipient } from "@/lib/api/messaging";
import { toast } from "@/lib/om/toast";

const SMS_SEGMENT = 160;

export function BroadcastComposer({
  channel,
  accent,
  fg = "#04140c",
  bare = false,
  onDone,
}: {
  channel: BroadcastChannel;
  accent: string;
  fg?: string;
  /** Render without the Card chrome — for use inside a modal. */
  bare?: boolean;
  /** Called after a successful send or draft-save (e.g. to close the modal). */
  onDone?: () => void;
}) {
  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  const [recipients, setRecipients] = useState<BroadcastRecipient[]>([]);
  const create = useCreateBroadcast();
  const send = useSendBroadcast();
  const busy = create.isPending || send.isPending;

  const segments = useMemo(
    () => (channel === "sms" ? Math.max(1, Math.ceil(body.length / SMS_SEGMENT)) : 0),
    [body, channel],
  );

  const reset = () => {
    setName("");
    setBody("");
    setRecipients([]);
  };

  const persist = async () => {
    const b = await create.mutateAsync({ channel, name: name.trim(), body, recipients });
    return b;
  };

  const onSaveDraft = async () => {
    if (!name.trim()) return toast.err("Give the broadcast a name");
    await persist();
    reset();
    onDone?.();
  };

  const onSend = async () => {
    if (!name.trim()) return toast.err("Give the broadcast a name");
    if (!body.trim()) return toast.err("Write a message");
    if (recipients.length === 0) return toast.err("Add at least one recipient");
    const b = await persist();
    await send.mutateAsync(b.id);
    reset();
    onDone?.();
  };

  const content = (
    <>
      {!bare && (
        <CardTitle icon={<Send />} color={accent}>
          New {channel === "sms" ? "SMS" : "WhatsApp"} broadcast
        </CardTitle>
      )}

      <Field label="Name">
        <OmInput value={name} onChange={(e) => setName(e.target.value)} placeholder="March promo" />
      </Field>

      <Field label="Message">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={4}
          placeholder={
            channel === "whatsapp"
              ? "Hi! Thanks for being a customer — here's what's new this week…"
              : "Short and clear works best for SMS."
          }
          className="w-full rounded-lg border border-om-border bg-white/[0.03] px-2.5 py-2 text-[12.5px] leading-relaxed text-om-text outline-none placeholder:text-om-muted focus:border-om-blue/60"
        />
        <div className="mt-1 flex items-center justify-between text-[10px] text-om-muted">
          <span>{body.length} characters</span>
          {channel === "sms" && (
            <span>
              {segments} {segments === 1 ? "segment" : "segments"}
            </span>
          )}
        </div>
      </Field>

      <RecipientPicker value={recipients} onChange={setRecipients} accent={accent} />

      <div className="flex items-center gap-2 border-t border-om-border pt-3">
        <OmButton variant="ghost" size="sm" onClick={onSaveDraft} disabled={busy}>
          <Save /> Save draft
        </OmButton>
        <button
          className="ml-auto inline-flex h-7 items-center gap-1.5 rounded-lg px-3 text-[12px] font-medium transition-opacity hover:opacity-90 disabled:opacity-50 [&_svg]:size-3.5"
          style={{ background: accent, color: fg }}
          onClick={onSend}
          disabled={busy}
        >
          {busy ? <Loader2 className="animate-spin" /> : <Send />}
          Send to {recipients.length || 0}
        </button>
      </div>
    </>
  );

  if (bare) return <div className="space-y-3">{content}</div>;
  return <Card className="space-y-3">{content}</Card>;
}
