"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Mail,
  FileText,
  Copy,
  Check,
  Loader2,
  Sparkles,
  RefreshCw,
  Send,
  SendHorizontal,
  CheckCircle2,
  Settings2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { OmButton } from "@/components/om/primitives/OmButton";
import { OmTextarea, OmInput } from "@/components/om/primitives/Field";
import { MarkdownLite } from "./MarkdownLite";
import { useGenerateOutreach, useEmailAccounts, useSendOutreach } from "./hooks";
import { toast } from "@/lib/om/toast";
import { relativeTime } from "@/lib/om/format";
import type { Lead } from "@/lib/api/leads";

function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          toast.ok(`${label} copied`);
          setTimeout(() => setDone(false), 1500);
        } catch {
          toast.err("Couldn’t copy");
        }
      }}
      className="inline-flex items-center gap-1 rounded-md border border-om-border px-1.5 py-0.5 text-[10px] text-om-muted transition-colors hover:text-om-text"
    >
      {done ? <Check className="size-3 text-om-green" /> : <Copy className="size-3" />}
      Copy
    </button>
  );
}

export function OutreachPanel({ lead }: { lead: Lead }) {
  const gen = useGenerateOutreach();
  const [fromCompany, setFromCompany] = useState(lead.sender_company ?? "");
  const [offer, setOffer] = useState(lead.offer ?? "");
  const [tab, setTab] = useState<"email" | "proposal">("email");

  const run = (regenerate: boolean) =>
    gen.mutate({
      id: lead.id,
      from_company: fromCompany.trim() || undefined,
      offer: offer.trim() || undefined,
      regenerate,
    });

  if (!lead.has_outreach) {
    return (
      <div className="rounded-lg border border-om-blue/25 bg-om-blue/[0.06] p-3">
        <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold text-om-blue">
          <Sparkles className="size-3.5" /> Outreach
        </div>
        <p className="text-[11.5px] leading-relaxed text-om-dim">
          AI reads what {lead.company || lead.name} does and writes a marketing email and a
          one-page proposal <span className="text-om-text">from your business to theirs</span>.
        </p>
        <OmInput
          value={fromCompany}
          onChange={(e) => setFromCompany(e.target.value)}
          placeholder="Your business name"
          className="mt-2 text-[11.5px]"
        />
        <OmTextarea
          rows={2}
          value={offer}
          onChange={(e) => setOffer(e.target.value)}
          placeholder="What you're offering them"
          className="mt-1.5 text-[11.5px]"
        />
        <OmButton
          variant="solid"
          size="sm"
          className="mt-2 w-full"
          onClick={() => run(false)}
          disabled={gen.isPending}
        >
          {gen.isPending ? <Loader2 className="animate-spin" /> : <Send />}
          {gen.isPending ? "Writing…" : "Generate email & proposal"}
        </OmButton>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-om-border bg-white/[0.02]">
      <div className="flex items-center gap-1 border-b border-om-border px-2 py-1.5">
        {(["email", "proposal"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium capitalize transition-colors",
              tab === t ? "bg-white/[0.06] text-om-text" : "text-om-muted hover:text-om-dim",
            )}
          >
            {t === "email" ? <Mail className="size-3" /> : <FileText className="size-3" />}
            {t}
          </button>
        ))}
        <button
          onClick={() => run(true)}
          disabled={gen.isPending}
          className="ml-auto inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[10.5px] text-om-muted transition-colors hover:text-om-text disabled:opacity-50"
        >
          {gen.isPending ? <Loader2 className="size-3 animate-spin" /> : <RefreshCw className="size-3" />}
          Regenerate
        </button>
      </div>

      <div className="p-3">
        {tab === "email" ? (
          <div>
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-om-muted">
                Subject
              </span>
              <CopyButton
                label="Email"
                text={`Subject: ${lead.outreach_subject}\n\n${lead.outreach_email}`}
              />
            </div>
            <div className="mb-2 rounded-md border border-om-border bg-om-bg/50 px-2.5 py-1.5 text-[12px] font-medium text-om-text">
              {lead.outreach_subject}
            </div>
            <div className="whitespace-pre-wrap rounded-md border border-om-border bg-om-bg/50 px-2.5 py-2 text-[11.5px] leading-relaxed text-om-dim">
              {lead.outreach_email}
            </div>
          </div>
        ) : (
          <div>
            <div className="mb-1.5 flex items-center justify-end">
              <CopyButton label="Proposal" text={lead.outreach_proposal ?? ""} />
            </div>
            <div className="rounded-md border border-om-border bg-om-bg/50 px-3 py-2">
              <MarkdownLite text={lead.outreach_proposal ?? ""} />
            </div>
          </div>
        )}
      </div>

      <SendRow lead={lead} />
    </div>
  );
}

function SendRow({ lead }: { lead: Lead }) {
  const { data } = useEmailAccounts();
  const send = useSendOutreach();
  const accounts = data?.items ?? [];
  const [accountId, setAccountId] = useState("");
  const [includeProposal, setIncludeProposal] = useState(true);

  useEffect(() => {
    if (!accountId && accounts.length) {
      setAccountId((accounts.find((a) => a.is_default) ?? accounts[0]).id);
    }
  }, [accounts, accountId]);

  const noEmail = !lead.email;

  return (
    <div className="border-t border-om-border p-3">
      {lead.outreach_sent_at && (
        <div className="mb-2 flex items-center gap-1.5 text-[11px] text-om-green">
          <CheckCircle2 className="size-3.5" />
          Sent {relativeTime(lead.outreach_sent_at)}
          {lead.outreach_sent_count > 1 ? ` · ${lead.outreach_sent_count}×` : ""}
        </div>
      )}

      {accounts.length === 0 ? (
        <Link
          href="/dashboard/settings"
          className="flex items-center gap-1.5 rounded-md border border-om-border bg-white/[0.02] px-2.5 py-2 text-[11px] text-om-muted transition-colors hover:text-om-text"
        >
          <Settings2 className="size-3.5" />
          Add a sending account in Settings to email leads
        </Link>
      ) : (
        <div className="flex items-center gap-2">
          <select
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            className="min-w-0 flex-1 rounded-lg border border-om-border bg-white/[0.03] px-2 py-1.5 text-[11.5px] text-om-dim outline-none focus:border-om-blue/60"
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.from_email}
              </option>
            ))}
          </select>
          <label className="flex shrink-0 cursor-pointer items-center gap-1 text-[10.5px] text-om-muted">
            <input
              type="checkbox"
              checked={includeProposal}
              onChange={(e) => setIncludeProposal(e.target.checked)}
              className="size-3 accent-om-blue"
            />
            + proposal
          </label>
          <OmButton
            variant="solid"
            size="sm"
            disabled={send.isPending || noEmail || !accountId}
            title={noEmail ? "This lead has no email address" : undefined}
            onClick={() =>
              send.mutate({ id: lead.id, email_account_id: accountId, include_proposal: includeProposal })
            }
          >
            {send.isPending ? <Loader2 className="animate-spin" /> : <SendHorizontal />}
            {lead.outreach_sent_at ? "Send again" : "Send"}
          </OmButton>
        </div>
      )}
      {noEmail && accounts.length > 0 && (
        <div className="mt-1 text-[10.5px] text-om-amber">No email address on this lead.</div>
      )}
    </div>
  );
}
