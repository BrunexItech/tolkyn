"use client";

import { useState } from "react";
import { ArrowLeft, Info, Loader2, Plus, Send, ShieldCheck, Users2 } from "lucide-react";
import { FaWhatsapp } from "react-icons/fa6";
import { Card, CardTitle } from "@/components/om/primitives/Card";
import { OmButton } from "@/components/om/primitives/OmButton";
import { EmptyState } from "@/components/om/primitives/EmptyState";
import { Pill } from "@/components/om/primitives/Pill";
import { relativeTime, shortDateTime } from "@/lib/om/format";
import { cn } from "@/lib/utils";
import {
  useCampaignGroup,
  useCampaignGroups,
  useSendCampaignGroupMessage,
} from "./hooks";
import { CampaignGroupCreateModal } from "./CampaignGroupCreateModal";

const WA_GREEN = "#25D366";

/** "Communities" — a shared WhatsApp-backed conversation where every
 * participant is relayed everyone else's replies under a pseudo-name only.
 * Only this admin view ever shows real names/numbers alongside them. */
export function CampaignGroups({ showHeaderButton = true }: { showHeaderButton?: boolean }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <Card accent="green" className="space-y-3">
      <CardTitle
        icon={<Users2 style={{ color: WA_GREEN }} />}
        color={WA_GREEN}
        action={
          showHeaderButton &&
          !selected && (
            <OmButton variant="solid" size="sm" onClick={() => setCreateOpen(true)} style={{ background: WA_GREEN, color: "#04140c" }}>
              <Plus /> New community
            </OmButton>
          )
        }
      >
        Communities (campaigns)
      </CardTitle>

      {selected ? (
        <GroupDetail id={selected} onBack={() => setSelected(null)} />
      ) : (
        <>
          <div className="flex items-start gap-2 rounded-lg border border-om-border bg-white/[0.02] px-2.5 py-2">
            <Info className="mt-0.5 size-3.5 shrink-0 text-om-faint" />
            <p className="text-[10.5px] leading-relaxed text-om-faint">
              A newly connected number reaches up to <strong className="text-om-muted">20 people a day</strong>,
              growing automatically to <strong className="text-om-muted">500 a day</strong> once it&rsquo;s been
              connected for two weeks. All your communities and broadcasts share this daily allowance.
            </p>
          </div>
          <GroupList onSelect={setSelected} />
        </>
      )}

      <CampaignGroupCreateModal open={createOpen} onOpenChange={setCreateOpen} />
    </Card>
  );
}

function GroupList({ onSelect }: { onSelect: (id: string) => void }) {
  const { data, isLoading } = useCampaignGroups();
  const items = data?.items ?? [];

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-6 text-[12px] text-om-muted">
        <Loader2 className="size-4 animate-spin" /> Loading communities…
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <EmptyState icon={<Users2 />} title="No communities yet">
        Group up participants who should see each other's messages — under a nickname, never a phone number.
      </EmptyState>
    );
  }

  return (
    <div className="space-y-1.5">
      {items.map((g) => (
        <button
          key={g.id}
          onClick={() => onSelect(g.id)}
          className="flex w-full items-center gap-2.5 rounded-lg border border-om-border bg-white/[0.02] px-3 py-2.5 text-left transition-colors hover:border-om-green/35 hover:bg-white/[0.04]"
        >
          <span className="grid size-8 shrink-0 place-items-center rounded-lg" style={{ background: `${WA_GREEN}1f` }}>
            <FaWhatsapp style={{ color: WA_GREEN }} className="size-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[12.5px] font-medium text-om-text">{g.name}</span>
            <span className="block truncate text-[10.5px] text-om-muted">
              {g.participants.length} participant{g.participants.length === 1 ? "" : "s"} · created{" "}
              {shortDateTime(g.created_at)}
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}

function GroupDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const { data: group, isLoading } = useCampaignGroup(id);
  const send = useSendCampaignGroupMessage();
  const [body, setBody] = useState("");

  const participantById = new Map((group?.participants ?? []).map((p) => [p.id, p]));

  const onSend = async () => {
    if (!body.trim()) return;
    await send.mutateAsync({ id, body: body.trim() });
    setBody("");
  };

  if (isLoading || !group) {
    return (
      <div className="flex items-center gap-2 py-6 text-[12px] text-om-muted">
        <Loader2 className="size-4 animate-spin" /> Loading…
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <button onClick={onBack} className="grid size-6 place-items-center rounded-md text-om-muted hover:bg-white/[0.05] hover:text-om-text">
          <ArrowLeft className="size-3.5" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[12.5px] font-semibold text-om-text">{group.name}</div>
          <div className="text-[10.5px] text-om-muted">{group.participants.length} participants</div>
        </div>
        <Pill tone="green" icon={<ShieldCheck className="size-3" />}>
          Hidden between members
        </Pill>
      </div>

      {/* Admin-only: real identities + numbers. Members only ever see the
          pseudonym — this panel and the feed below are the workspace's view. */}
      <div className="flex flex-wrap gap-1.5">
        {group.participants.map((p) => (
          <span
            key={p.id}
            className="flex items-center gap-1.5 rounded-md border border-om-border bg-white/[0.03] px-2 py-1 text-[10.5px]"
          >
            <span className="font-medium text-om-dim">{p.pseudo_name}</span>
            <span className="text-om-faint">·</span>
            {p.real_name && <span className="text-om-dim">{p.real_name}</span>}
            <a
              href={`tel:${p.phone}`}
              className="font-mono text-om-blue hover:underline"
              title="Call this participant"
            >
              {p.phone}
            </a>
          </span>
        ))}
      </div>

      {/* message feed — real identity shown, this view only */}
      <div className="om-scroll max-h-72 space-y-1.5 overflow-y-auto rounded-lg border border-om-border bg-white/[0.015] p-2">
        {group.messages.length === 0 ? (
          <EmptyState title="No messages yet" className="py-5" />
        ) : (
          group.messages.map((m) => {
            const p = m.participant_id ? participantById.get(m.participant_id) : null;
            const isAdmin = !m.participant_id;
            return (
              <div
                key={m.id}
                className={cn(
                  "max-w-[85%] rounded-lg px-2.5 py-1.5 text-[12px] leading-relaxed",
                  isAdmin ? "ml-auto bg-om-green/12 text-om-text" : "bg-white/[0.05] text-om-dim",
                )}
              >
                <div className="mb-0.5 flex items-center gap-1.5 text-[9.5px] font-semibold uppercase tracking-wide text-om-faint">
                  <span>
                    {isAdmin
                      ? "You (business)"
                      : `${p?.pseudo_name ?? "Unknown"}${p?.real_name ? ` · ${p.real_name}` : ""}${
                          p?.phone ? ` · ${p.phone}` : ""
                        }`}
                  </span>
                  <span className="ml-auto font-normal normal-case">{relativeTime(m.created_at)}</span>
                </div>
                <span className="om-selectable">{m.body}</span>
              </div>
            );
          })
        )}
      </div>

      {group.send_errors.length > 0 && (
        <div className="rounded-lg border border-om-amber/25 bg-om-amber/[0.06] px-2.5 py-1.5 text-[10.5px] text-om-amber">
          {group.send_errors.join(" · ")}
        </div>
      )}

      <div className="flex items-center gap-2">
        <input
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onSend();
            }
          }}
          placeholder="Message the whole community as the business…"
          className="flex-1 rounded-lg border border-om-border bg-white/[0.03] px-3 py-2 text-[12px] text-om-text outline-none placeholder:text-om-muted focus:border-om-green/60"
        />
        <OmButton
          variant="solid"
          size="md"
          onClick={onSend}
          disabled={send.isPending || !body.trim()}
          style={{ background: WA_GREEN, color: "#04140c" }}
        >
          {send.isPending ? <Loader2 className="animate-spin" /> : <Send />}
        </OmButton>
      </div>
    </div>
  );
}
