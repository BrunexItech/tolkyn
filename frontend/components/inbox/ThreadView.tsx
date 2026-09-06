"use client";

import { useEffect, useRef, useState } from "react";
import {
  SendHorizontal,
  Loader2,
  CheckCircle2,
  RotateCcw,
  ExternalLink,
  MessageCircle,
  Heart,
  Phone,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/om/primitives/EmptyState";
import { Spinner } from "@/components/om/primitives/Spinner";
import { OmButton } from "@/components/om/primitives/OmButton";
import { platform as findPlatform } from "@/lib/om/platforms";
import { useThread, useReply, useSetStatus } from "./hooks";
import { relativeTime, shortDateTime } from "@/lib/om/format";

export function ThreadView({ threadId }: { threadId: string | null }) {
  const { data: t, isLoading } = useThread(threadId);
  const reply = useReply();
  const setStatus = useSetStatus();
  const [text, setText] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const lastMessageId = t?.messages[t.messages.length - 1]?.id;
  // Ride the scroll to the newest message — whether it just arrived from the
  // other side (polling) or we just sent it.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [lastMessageId, threadId]);

  if (!threadId) {
    return (
      <div className="grid h-full place-items-center rounded-xl border border-om-border bg-om-card">
        <EmptyState icon={<MessageCircle />} title="Pick a conversation">
          Comments, mentions and DMs from every connected account land here.
        </EmptyState>
      </div>
    );
  }
  if (isLoading || !t) {
    return (
      <div className="grid h-full place-items-center rounded-xl border border-om-border bg-om-card">
        <Spinner size="lg" />
      </div>
    );
  }

  const p = findPlatform(t.platform);

  // For phone-based channels (WhatsApp, SMS) the handle is the customer's real
  // number — surface it so the team can call. Never masked here; the only
  // place identities are hidden is between community members.
  const phone =
    t.author_handle && /^\+?\d[\d\s()-]{6,}$/.test(t.author_handle) && ["whatsapp", "sms"].includes(t.platform)
      ? t.author_handle.replace(/[\s()-]/g, "")
      : null;

  const send = () => {
    if (!text.trim()) return;
    reply.mutate({ id: t.id, body: text.trim() }, { onSuccess: () => setText("") });
  };

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-om-border bg-om-card">
      {/* header */}
      <div className="flex items-center gap-2.5 border-b border-om-border p-3">
        <span className="grid size-8 place-items-center rounded-full bg-white/[0.05] text-[11px] font-bold text-om-dim">
          {t.author_name.slice(0, 2).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-[12.5px] font-semibold">
            {t.author_name}
            {p && <p.Icon className="size-3" style={{ color: p.color }} />}
          </div>
          <div className="truncate text-[10.5px] text-om-muted">
            {phone ? (
              <a href={`tel:${phone}`} className="font-mono text-om-blue hover:underline">
                {t.author_handle}
              </a>
            ) : (
              t.author_handle || t.context
            )}
          </div>
        </div>
        {phone && (
          <a
            href={`tel:${phone}`}
            className="inline-flex h-7 items-center gap-1 rounded-lg border border-om-green/30 bg-om-green/10 px-2.5 text-[11.5px] font-medium text-om-green transition-colors hover:bg-om-green/15"
          >
            <Phone className="size-3.5" /> Call
          </a>
        )}
        {t.status === "done" ? (
          <OmButton variant="ghost" size="sm" onClick={() => setStatus.mutate({ id: t.id, status: "open" })}>
            <RotateCcw /> Reopen
          </OmButton>
        ) : (
          <OmButton variant="subtle" size="sm" onClick={() => setStatus.mutate({ id: t.id, status: "done" })}>
            <CheckCircle2 /> Mark done
          </OmButton>
        )}
      </div>

      {/* messages */}
      <div ref={scrollRef} className="om-scroll flex-1 space-y-3 overflow-y-auto p-3">
        {t.messages.map((m) => (
          <div key={m.id} className={cn("flex", m.direction === "out" ? "justify-end" : "justify-start")}>
            <div
              className={cn(
                "max-w-[78%] rounded-xl px-3 py-2 text-[12px] leading-relaxed",
                m.direction === "out"
                  ? "rounded-br-sm bg-om-blue/15 text-om-text"
                  : "rounded-bl-sm border border-om-border bg-white/[0.02] text-om-dim",
              )}
            >
              <div className="mb-0.5 flex items-center gap-1.5 text-[9.5px] text-om-muted">
                <span className="font-semibold">{m.author_name}</span>
                {m.via === "ai" && <span className="rounded bg-om-violet/15 px-1 text-om-violet">AI</span>}
                <span>{m.at ? relativeTime(m.at) : ""}</span>
              </div>
              <span className="om-selectable">{m.body}</span>
              {m.like_count != null && m.like_count > 0 && (
                <div className="mt-1 flex items-center gap-1 text-[9.5px] text-om-faint">
                  <Heart className="size-2.5" /> {m.like_count}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* reply */}
      <div className="border-t border-om-border p-2.5">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) send();
          }}
          rows={2}
          placeholder={`Reply as your ${t.platform} account…  (⌘↵ to send)`}
          className="w-full resize-none rounded-lg border border-om-border bg-white/[0.03] px-2.5 py-2 text-[12px] text-om-text outline-none focus:border-om-blue/60"
        />
        <div className="mt-1.5 flex items-center gap-2">
          {t.permalink && (
            <a
              href={t.permalink}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-[10.5px] text-om-muted hover:text-om-text"
            >
              View on {t.platform} <ExternalLink className="size-3" />
            </a>
          )}
          <span className="text-[10px] text-om-faint">
            {t.messages.length} message{t.messages.length === 1 ? "" : "s"} · started {shortDateTime(t.messages[0]?.at ?? t.last_message_at ?? "")}
          </span>
          <OmButton
            variant="solid"
            size="sm"
            className="ml-auto"
            onClick={send}
            disabled={reply.isPending || !text.trim()}
          >
            {reply.isPending ? <Loader2 className="animate-spin" /> : <SendHorizontal />}
            Send reply
          </OmButton>
        </div>
      </div>
    </div>
  );
}
