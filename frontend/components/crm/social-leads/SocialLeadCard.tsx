"use client";

import {
  MessageCircle,
  Send,
  Sparkles,
  Tag,
  ExternalLink,
  UserPlus,
  X,
} from "lucide-react";
import { OmButton } from "@/components/om/primitives/OmButton";
import { platform as findPlatform } from "@/lib/om/platforms";
import { relativeTime, truncate } from "@/lib/om/format";
import { cn } from "@/lib/utils";
import { IntentBadge } from "./IntentBadge";
import { useSetSocialLeadStatus } from "./hooks";
import type { SocialLead } from "@/lib/api/socialLeads";

const KIND_VERB: Record<string, string> = {
  comment: "commented on",
  dm: "messaged you on",
  mention: "mentioned you on",
};

export function SocialLeadCard({
  lead,
  onOpen,
  onConvert,
}: {
  lead: SocialLead;
  onOpen: () => void;
  onConvert: () => void;
}) {
  const p = findPlatform(lead.platform);
  const setStatus = useSetSocialLeadStatus();
  const initials = lead.author_name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");

  const dismissed = lead.status === "dismissed";
  const converted = lead.status === "converted";

  return (
    <div
      className={cn(
        "group rounded-xl border bg-om-card p-3.5 transition-colors",
        lead.intent === "hot" && !dismissed && !converted
          ? "border-om-red/25"
          : "border-om-border",
        (dismissed || converted) && "opacity-60",
      )}
    >
      {/* header */}
      <div className="flex items-center gap-2.5">
        <span
          className="grid size-8 shrink-0 place-items-center rounded-full text-[10.5px] font-bold text-white"
          style={{
            background: p ? p.color : "linear-gradient(135deg,#4f7aff,#8b7bf0)",
          }}
        >
          {initials || "?"}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-[12.5px] font-semibold text-om-text">
              {lead.author_name}
            </span>
            {lead.author_handle && (
              <span className="truncate text-[10.5px] text-om-muted">
                {lead.author_handle}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1 text-[10.5px] text-om-muted">
            {p?.Icon && <p.Icon className="size-3" style={{ color: p.color }} />}
            {KIND_VERB[lead.kind] ?? "wrote on"} {p?.name ?? lead.platform}
            {lead.last_message_at && <> · {relativeTime(lead.last_message_at)}</>}
          </div>
        </div>
        <IntentBadge intent={lead.intent} />
      </div>

      {/* the message */}
      <button
        onClick={onOpen}
        className="mt-2.5 block w-full rounded-lg border border-om-border/60 bg-white/[0.02] p-2.5 text-left"
      >
        <div className="flex gap-1.5 text-[12px] leading-relaxed text-om-dim">
          <MessageCircle className="mt-0.5 size-3.5 shrink-0 text-om-muted" />
          <span>&ldquo;{truncate(lead.message, 220)}&rdquo;</span>
        </div>
        {lead.post_context && (
          <div className="mt-1.5 pl-5 text-[10px] text-om-faint">
            {truncate(lead.post_context, 90)}
          </div>
        )}
      </button>

      {/* what they want */}
      {lead.product_interest && (
        <div className="mt-2 flex items-center gap-1.5 text-[11.5px]">
          <Tag className="size-3.5 text-om-violet" />
          <span className="text-om-muted">Interested in</span>
          <span className="rounded-md border border-om-violet/25 bg-om-violet/10 px-1.5 py-0.5 font-semibold text-om-violet">
            {lead.product_interest}
          </span>
        </div>
      )}

      {/* AI read */}
      {lead.ai_summary && (
        <div className="mt-2 flex gap-1.5 text-[11px] leading-relaxed text-om-muted">
          <Sparkles className="mt-0.5 size-3 shrink-0 text-om-blue" />
          <span>{lead.ai_summary}</span>
        </div>
      )}

      {/* buying signals */}
      {lead.buying_signals.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {lead.buying_signals.map((s) => (
            <span
              key={s}
              className="rounded-md border border-om-border bg-white/[0.03] px-1.5 py-0.5 text-[10px] text-om-dim"
            >
              {s}
            </span>
          ))}
        </div>
      )}

      {/* actions */}
      <div className="mt-3 flex items-center gap-1.5">
        {converted ? (
          <span className="text-[11px] font-semibold text-om-green">
            In the CRM
          </span>
        ) : (
          <>
            <OmButton variant="solid" size="xs" onClick={onConvert}>
              <UserPlus /> Add to CRM
            </OmButton>
            <OmButton variant="ghost" size="xs" onClick={onOpen}>
              <Send /> Reply
            </OmButton>
          </>
        )}
        {lead.permalink && (
          <a
            href={lead.permalink}
            target="_blank"
            rel="noreferrer"
            className="grid size-6 place-items-center rounded-md text-om-muted hover:bg-white/[0.05] hover:text-om-text"
            title="Open on platform"
          >
            <ExternalLink className="size-3.5" />
          </a>
        )}
        {!converted && !dismissed && (
          <button
            onClick={() => setStatus.mutate({ id: lead.id, status: "dismissed" })}
            className="ml-auto grid size-6 place-items-center rounded-md text-om-muted hover:bg-om-red/10 hover:text-om-red"
            title="Not a lead / dismiss"
          >
            <X className="size-3.5" />
          </button>
        )}
        {dismissed && (
          <button
            onClick={() => setStatus.mutate({ id: lead.id, status: "new" })}
            className="ml-auto text-[10.5px] text-om-muted hover:text-om-blue"
          >
            Restore
          </button>
        )}
      </div>
    </div>
  );
}
