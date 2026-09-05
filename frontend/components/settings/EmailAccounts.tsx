"use client";

import { useState } from "react";
import {
  Mail,
  Plus,
  Star,
  Pencil,
  Trash2,
  SendHorizontal,
  CheckCircle2,
  CircleAlert,
  Loader2,
} from "lucide-react";
import { Card, CardTitle } from "@/components/om/primitives/Card";
import { EmptyState } from "@/components/om/primitives/EmptyState";
import { OmButton } from "@/components/om/primitives/OmButton";
import { EmailAccountDialog } from "./EmailAccountDialog";
import {
  useEmailAccounts,
  useUpdateEmailAccount,
  useDeleteEmailAccount,
  useTestEmailAccount,
} from "./hooks";
import type { EmailAccount } from "@/lib/api/email";
import { relativeTime } from "@/lib/om/format";

export function EmailAccounts() {
  const { data, isLoading } = useEmailAccounts();
  const update = useUpdateEmailAccount();
  const del = useDeleteEmailAccount();
  const test = useTestEmailAccount();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<EmailAccount | null>(null);

  const accounts = data?.items ?? [];

  return (
    <Card>
      <CardTitle
        icon={<Mail />}
        action={
          <OmButton
            variant="solid"
            size="xs"
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
          >
            <Plus /> Add
          </OmButton>
        }
      >
        Sending accounts
      </CardTitle>

      {isLoading ? (
        <EmptyState title="Loading…" />
      ) : accounts.length === 0 ? (
        <EmptyState icon={<Mail />} title="No sending accounts">
          Connect a business email to send outreach from your own address.
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-2">
          {accounts.map((a) => (
            <div key={a.id} className="rounded-lg border border-om-border bg-white/[0.02] p-3">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[12.5px] font-semibold">{a.label}</span>
                    {a.is_default && (
                      <span className="flex items-center gap-0.5 rounded bg-om-blue/15 px-1 py-px text-[9px] font-bold text-om-blue">
                        <Star className="size-2.5 fill-current" /> Default
                      </span>
                    )}
                    {a.verified_at ? (
                      <span className="flex items-center gap-0.5 text-[10px] text-om-green">
                        <CheckCircle2 className="size-3" /> Verified
                      </span>
                    ) : a.last_error ? (
                      <span className="flex items-center gap-0.5 text-[10px] text-om-red">
                        <CircleAlert className="size-3" /> Needs attention
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-0.5 truncate text-[11px] text-om-muted">
                    {a.from_name} · {a.from_email}
                  </div>
                  <div className="mt-0.5 truncate font-mono text-[10px] text-om-faint">
                    {a.smtp_host}:{a.smtp_port} · {a.sent_today}/{a.daily_limit} today · {a.sent_total} sent
                    {a.last_used_at ? ` · last used ${relativeTime(a.last_used_at)}` : ""}
                  </div>
                  {a.last_error && (
                    <div className="mt-1 text-[10.5px] text-om-red">{a.last_error}</div>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    onClick={() => test.mutate({ id: a.id })}
                    disabled={test.isPending}
                    title="Verify connection"
                    className="grid size-7 place-items-center rounded-md text-om-muted hover:bg-om-blue/10 hover:text-om-blue"
                  >
                    {test.isPending && test.variables?.id === a.id ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <SendHorizontal className="size-3.5" />
                    )}
                  </button>
                  {!a.is_default && (
                    <button
                      onClick={() => update.mutate({ id: a.id, is_default: true })}
                      title="Make default"
                      className="grid size-7 place-items-center rounded-md text-om-muted hover:bg-om-amber/10 hover:text-om-amber"
                    >
                      <Star className="size-3.5" />
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setEditing(a);
                      setDialogOpen(true);
                    }}
                    title="Edit"
                    className="grid size-7 place-items-center rounded-md text-om-muted hover:bg-white/[0.06] hover:text-om-text"
                  >
                    <Pencil className="size-3.5" />
                  </button>
                  <button
                    onClick={() => del.mutate(a.id)}
                    title="Remove"
                    className="grid size-7 place-items-center rounded-md text-om-muted hover:bg-om-red/10 hover:text-om-red"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <EmailAccountDialog open={dialogOpen} onOpenChange={setDialogOpen} account={editing} />
    </Card>
  );
}
