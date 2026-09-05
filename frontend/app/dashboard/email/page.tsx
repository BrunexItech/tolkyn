"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Mail, Send, Users, Loader2, Info, Settings2 } from "lucide-react";
import { SectionHeading } from "@/components/om/primitives/SectionHeading";
import { Card, CardTitle } from "@/components/om/primitives/Card";
import { OmButton } from "@/components/om/primitives/OmButton";
import { EmptyState } from "@/components/om/primitives/EmptyState";
import { StatusBadge } from "@/components/om/primitives/StatusBadge";
import { Field, OmInput, OmSelect, OmTextarea } from "@/components/om/primitives/Field";
import { useConfirm } from "@/components/om/primitives/ConfirmDialog";
import { toast } from "@/lib/om/toast";
import { emailApi, type CampaignSource, type SendCampaignBody } from "@/lib/api/email";
import { useEmailAccounts } from "@/components/settings/hooks";

const SOURCES: { key: CampaignSource; label: string; hint: string }[] = [
  { key: "leads", label: "Leads", hint: "Everyone in Lead Generator with an email address" },
  { key: "customers", label: "CRM customers", hint: "Everyone in your CRM with an email address" },
  { key: "manual", label: "Paste a list", hint: "One email per line (optionally: email, Name)" },
];

export default function BulkEmailPage() {
  const qc = useQueryClient();
  const { confirm, dialog } = useConfirm();
  const { data: accountsData } = useEmailAccounts();
  const accounts = accountsData?.items ?? [];
  const defaultAccount = accounts.find((a) => a.is_default) ?? accounts[0];

  const [source, setSource] = useState<CampaignSource>("leads");
  const [manual, setManual] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [accountId, setAccountId] = useState("");

  useEffect(() => {
    if (!accountId && defaultAccount) setAccountId(defaultAccount.id);
  }, [defaultAccount, accountId]);

  const manualRecipients = useMemo(
    () =>
      manual
        .split(/[\n,;]+/)
        .map((s) => s.trim())
        .filter(Boolean)
        .map((line) => {
          const [email, ...rest] = line.split(/[\s,]+/);
          return { email, name: rest.join(" ") };
        })
        .filter((r) => r.email.includes("@")),
    [manual],
  );

  const previewBody = { source, manual: source === "manual" ? manualRecipients : undefined };
  const { data: preview, isFetching: previewing } = useQuery({
    queryKey: ["email-recipients", source, source === "manual" ? manual : ""],
    queryFn: () => emailApi.previewRecipients(previewBody),
  });

  const { data: history } = useQuery({ queryKey: ["email-campaigns"], queryFn: emailApi.campaigns });

  const send = useMutation({
    mutationFn: (b: SendCampaignBody) => emailApi.sendCampaign(b),
    onSuccess: (row) => {
      qc.invalidateQueries({ queryKey: ["email-campaigns"] });
      qc.invalidateQueries({ queryKey: ["email-accounts"] });
      toast.ok(`Sent ${row.sent}/${row.total} · ${row.failed} failed`);
      setSubject("");
      setBody("");
      setManual("");
    },
    onError: (e: Error) => toast.err(e.message),
  });

  const count = preview?.count ?? 0;
  const acct = accounts.find((a) => a.id === accountId);
  const remaining = acct ? Math.max(0, acct.daily_limit - acct.sent_today) : 0;

  const doSend = async () => {
    if (!subject.trim() || !body.trim()) return toast.err("Add a subject and a message");
    if (!count) return toast.err("No recipients");
    if (!acct) return toast.err("Choose a sending account");
    const ok = await confirm({
      title: `Send to ${count} recipient${count === 1 ? "" : "s"}?`,
      message: `From ${acct.from_email}. ${
        count > remaining ? `Only ${remaining} left in today's limit — the rest will be skipped.` : ""
      }`,
      confirmLabel: "Send now",
    });
    if (!ok) return;
    send.mutate({
      subject,
      body,
      email_account_id: accountId,
      source,
      manual: source === "manual" ? manualRecipients : undefined,
    });
  };

  return (
    <div className="om-anim-rise space-y-3">
      <SectionHeading
        title="Bulk Email"
        subtitle="Send an email to your leads or customers from your own address."
        icon={<Mail />}
        actions={
          <OmButton asChild variant="outline" size="sm">
            <Link href="/dashboard/settings">
              <Settings2 /> Sending accounts
            </Link>
          </OmButton>
        }
      />

      {accounts.length === 0 ? (
        <EmptyState icon={<Mail />} title="Add a sending account first">
          Bulk Email sends from your own business email. Add one in{" "}
          <Link href="/dashboard/settings" className="text-om-blue hover:underline">
            Settings
          </Link>
          .
        </EmptyState>
      ) : (
        <div className="grid gap-3 lg:grid-cols-[1fr_320px]">
          <Card className="flex flex-col gap-2">
            <CardTitle icon={<Send />}>Compose</CardTitle>

            <Field label="Send to">
              <OmSelect value={source} onChange={(e) => setSource(e.target.value as CampaignSource)}>
                {SOURCES.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </OmSelect>
            </Field>

            {source === "manual" && (
              <Field label="Recipients" hint="One per line. “jane@acme.co Jane Doe” to personalise.">
                <OmTextarea
                  value={manual}
                  onChange={(e) => setManual(e.target.value)}
                  placeholder={"jane@acme.co Jane Doe\nsam@company.com"}
                  className="min-h-[90px]"
                />
              </Field>
            )}

            <Field label="From">
              <OmSelect value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.from_name} · {a.from_email}
                  </option>
                ))}
              </OmSelect>
            </Field>

            <Field label="Subject">
              <OmInput value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="A quick note" />
            </Field>

            <Field
              label="Message"
              hint="Merge fields: {{name}}, {{first_name}}, {{company}}"
            >
              <OmTextarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder={"Hi {{first_name}},\n\n…"}
                className="min-h-[160px]"
              />
            </Field>

            <div className="flex items-center justify-between border-t border-om-border pt-2">
              <span className="flex items-center gap-1.5 text-[11px] text-om-muted">
                <Users className="size-3.5" />
                {previewing ? "counting…" : `${count} recipient${count === 1 ? "" : "s"}`}
                {acct && ` · ${remaining} left today`}
              </span>
              <OmButton variant="solid" size="sm" onClick={doSend} disabled={send.isPending || !count}>
                {send.isPending ? <Loader2 className="animate-spin" /> : <Send />} Send email
              </OmButton>
            </div>
          </Card>

          <div className="space-y-3">
            <Card className="flex flex-col gap-1.5">
              <CardTitle icon={<Info />}>Recipients</CardTitle>
              {preview?.sample?.length ? (
                <ul className="flex flex-col gap-1 text-[11px] text-om-muted">
                  {preview.sample.map((r) => (
                    <li key={r.email} className="truncate">
                      {r.name ? `${r.name} · ` : ""}
                      {r.email}
                    </li>
                  ))}
                  {count > preview.sample.length && (
                    <li className="text-om-faint">+ {count - preview.sample.length} more</li>
                  )}
                </ul>
              ) : (
                <p className="text-[11px] text-om-muted">No valid recipients yet.</p>
              )}
            </Card>

            <Card className="flex flex-col gap-1.5">
              <CardTitle>Recent sends</CardTitle>
              {history?.length ? (
                <ul className="flex flex-col divide-y divide-white/[0.05]">
                  {history.map((c) => (
                    <li key={c.id} className="flex items-center justify-between gap-2 py-1.5">
                      <span className="min-w-0 truncate text-[11.5px]">{c.subject}</span>
                      <StatusBadge tone={c.failed ? "amber" : "green"}>
                        {c.sent}/{c.total}
                      </StatusBadge>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[11px] text-om-muted">Nothing sent yet.</p>
              )}
            </Card>
          </div>
        </div>
      )}
      {dialog}
    </div>
  );
}
