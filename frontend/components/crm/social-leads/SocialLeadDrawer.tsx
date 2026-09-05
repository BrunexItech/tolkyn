"use client";

import { useEffect, useState } from "react";
import {
  Sparkles,
  Send,
  RefreshCw,
  ExternalLink,
  Tag,
  MessageCircle,
  UserPlus,
  Loader2,
} from "lucide-react";
import { Drawer } from "@/components/om/primitives/Drawer";
import { OmButton } from "@/components/om/primitives/OmButton";
import { Field, OmInput } from "@/components/om/primitives/Field";
import { platform as findPlatform } from "@/lib/om/platforms";
import { shortDateTime } from "@/lib/om/format";
import { IntentBadge } from "./IntentBadge";
import {
  useConvertSocialLead,
  useReclassifySocialLead,
  useReplySocialLead,
  useSetSocialLeadStatus,
} from "./hooks";
import type { SocialLead } from "@/lib/api/socialLeads";

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-om-faint">
      {children}
    </div>
  );
}

export function SocialLeadDrawer({
  lead,
  onOpenChange,
}: {
  lead: SocialLead | null;
  onOpenChange: (v: boolean) => void;
}) {
  const p = lead ? findPlatform(lead.platform) : undefined;
  const reply = useReplySocialLead();
  const convert = useConvertSocialLead();
  const reclassify = useReclassifySocialLead();
  const setStatus = useSetSocialLeadStatus();

  const [tab, setTab] = useState<"reply" | "convert">("reply");
  const [replyText, setReplyText] = useState("");
  const [stage, setStage] = useState("prospect");
  const [mrr, setMrr] = useState("");
  const [email, setEmail] = useState("");

  useEffect(() => {
    if (lead) {
      setReplyText(lead.suggested_reply || "");
      setTab("reply");
      setStage("prospect");
      setMrr("");
      setEmail("");
    }
  }, [lead?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const canReply = !!lead?.inbox_thread_id;
  const converted = lead?.status === "converted";

  return (
    <Drawer
      open={!!lead}
      onOpenChange={onOpenChange}
      title={lead?.author_name ?? "Social lead"}
      subtitle={
        lead
          ? `${p?.name ?? lead.platform}${lead.author_handle ? ` · ${lead.author_handle}` : ""}`
          : undefined
      }
      width={460}
    >
      {!lead ? (
        <div className="py-10 text-center text-[12px] text-om-muted">Loading…</div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <IntentBadge intent={lead.intent} />
            {lead.confidence != null && (
              <span className="text-[10.5px] text-om-muted">
                {Math.round(lead.confidence)}% confidence
              </span>
            )}
            {lead.classifier && (
              <span className="rounded border border-om-border px-1.5 py-0.5 text-[9.5px] uppercase tracking-wide text-om-faint">
                {lead.classifier === "openai" ? "AI" : "keyword match"}
              </span>
            )}
            <button
              onClick={() => reclassify.mutate(lead.id)}
              disabled={reclassify.isPending}
              className="ml-auto flex items-center gap-1 text-[10.5px] text-om-muted hover:text-om-blue"
            >
              <RefreshCw
                className={reclassify.isPending ? "size-3 animate-spin" : "size-3"}
              />
              Re-analyse
            </button>
          </div>

          {/* the message */}
          <div>
            <Label>What they said</Label>
            <div className="rounded-lg border border-om-border bg-white/[0.02] p-2.5 text-[12px] leading-relaxed text-om-dim">
              <div className="flex gap-1.5">
                <MessageCircle className="mt-0.5 size-3.5 shrink-0 text-om-muted" />
                <span>&ldquo;{lead.message}&rdquo;</span>
              </div>
              {lead.post_context && (
                <div className="mt-2 border-t border-om-border/60 pt-2 text-[10.5px] text-om-faint">
                  On: {lead.post_context}
                </div>
              )}
            </div>
            {lead.permalink && (
              <a
                href={lead.permalink}
                target="_blank"
                rel="noreferrer"
                className="mt-1.5 inline-flex items-center gap-1 text-[10.5px] text-om-muted hover:text-om-blue"
              >
                <ExternalLink className="size-3" /> Open on {p?.name ?? lead.platform}
              </a>
            )}
          </div>

          {lead.product_interest && (
            <div>
              <Label>Interested in</Label>
              <span className="inline-flex items-center gap-1.5 rounded-md border border-om-violet/25 bg-om-violet/10 px-2 py-1 text-[12px] font-semibold text-om-violet">
                <Tag className="size-3.5" />
                {lead.product_interest}
              </span>
            </div>
          )}

          {lead.ai_summary && (
            <div className="rounded-lg border border-om-blue/20 bg-om-blue/[0.05] p-2.5">
              <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold text-om-blue">
                <Sparkles className="size-3.5" /> AI read
              </div>
              <p className="text-[12px] leading-relaxed text-om-dim">{lead.ai_summary}</p>
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
            </div>
          )}

          {/* action tabs */}
          {!converted && (
            <div>
              <div className="mb-2 flex gap-1 rounded-lg border border-om-border bg-white/[0.02] p-0.5">
                <button
                  onClick={() => setTab("reply")}
                  className={`flex-1 rounded-md px-2 py-1.5 text-[11.5px] font-medium ${
                    tab === "reply" ? "bg-white/[0.06] text-om-text" : "text-om-muted"
                  }`}
                >
                  Reply
                </button>
                <button
                  onClick={() => setTab("convert")}
                  className={`flex-1 rounded-md px-2 py-1.5 text-[11.5px] font-medium ${
                    tab === "convert" ? "bg-white/[0.06] text-om-text" : "text-om-muted"
                  }`}
                >
                  Add to CRM
                </button>
              </div>

              {tab === "reply" ? (
                <div className="space-y-2">
                  <textarea
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    rows={4}
                    placeholder={
                      canReply
                        ? "Write a reply — it posts back to the comment / DM"
                        : "This lead has no linked thread to reply to"
                    }
                    disabled={!canReply}
                    className="w-full resize-none rounded-lg border border-om-border bg-white/[0.03] px-2.5 py-2 text-[12px] text-om-text outline-none placeholder:text-om-muted focus:border-om-blue/60 disabled:opacity-50"
                  />
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-om-faint">
                      {lead.suggested_reply
                        ? "Prefilled with an AI-suggested reply — edit before sending"
                        : ""}
                    </span>
                    <OmButton
                      variant="solid"
                      size="sm"
                      disabled={!canReply || !replyText.trim() || reply.isPending}
                      onClick={() =>
                        reply.mutate({ id: lead.id, body: replyText.trim() })
                      }
                    >
                      {reply.isPending ? (
                        <Loader2 className="animate-spin" />
                      ) : (
                        <Send />
                      )}
                      Send reply
                    </OmButton>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Stage">
                      <select
                        value={stage}
                        onChange={(e) => setStage(e.target.value)}
                        className="w-full rounded-lg border border-om-border bg-white/[0.03] px-2.5 py-2 text-[12px] text-om-text outline-none focus:border-om-blue/60"
                      >
                        <option value="lead">Lead</option>
                        <option value="prospect">Prospect</option>
                        <option value="trial">Trial</option>
                        <option value="active">Active</option>
                      </select>
                    </Field>
                    <Field label="Monthly value">
                      <OmInput
                        type="number"
                        value={mrr}
                        onChange={(e) => setMrr(e.target.value)}
                        placeholder="0"
                      />
                    </Field>
                  </div>
                  <Field label="Email (optional)">
                    <OmInput
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="name@example.com"
                    />
                  </Field>
                  <OmButton
                    variant="solid"
                    size="sm"
                    className="w-full"
                    disabled={convert.isPending}
                    onClick={() =>
                      convert.mutate(
                        {
                          id: lead.id,
                          stage,
                          monthly_value: mrr ? Number(mrr) : undefined,
                          email: email.trim() || undefined,
                        },
                        { onSuccess: () => onOpenChange(false) },
                      )
                    }
                  >
                    {convert.isPending ? (
                      <Loader2 className="animate-spin" />
                    ) : (
                      <UserPlus />
                    )}
                    Create customer
                  </OmButton>
                </div>
              )}
            </div>
          )}

          {/* status row */}
          <div className="flex items-center gap-2 border-t border-om-border pt-3">
            <span className="text-[10.5px] text-om-faint">Status</span>
            <select
              value={lead.status}
              onChange={(e) =>
                setStatus.mutate({ id: lead.id, status: e.target.value as SocialLead["status"] })
              }
              className="rounded-lg border border-om-border bg-white/[0.03] px-2 py-1.5 text-[11.5px] text-om-dim outline-none focus:border-om-blue/60"
            >
              <option value="new">New</option>
              <option value="contacted">Contacted</option>
              <option value="qualified">Qualified</option>
              <option value="converted">Converted</option>
              <option value="dismissed">Dismissed</option>
            </select>
            {converted && lead.converted_customer_id && (
              <span className="ml-auto text-[10.5px] text-om-green">
                Linked to a customer
              </span>
            )}
          </div>

          <div className="text-[10px] text-om-faint">
            Detected {lead.detected_at ? shortDateTime(lead.detected_at) : "—"}
            {lead.classified_at
              ? ` · analysed ${shortDateTime(lead.classified_at)}`
              : ""}
          </div>
        </>
      )}
    </Drawer>
  );
}
