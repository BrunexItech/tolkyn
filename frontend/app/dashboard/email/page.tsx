"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Mail, Send, Users, Loader2, Info, Settings2, Upload, ChevronDown, CheckCircle2, XCircle, MinusCircle } from "lucide-react";
import { SectionHeading } from "@/components/om/primitives/SectionHeading";
import { Card, CardTitle } from "@/components/om/primitives/Card";
import { OmButton } from "@/components/om/primitives/OmButton";
import { EmptyState } from "@/components/om/primitives/EmptyState";
import { StatusBadge } from "@/components/om/primitives/StatusBadge";
import { Field, OmInput, OmSelect, OmTextarea } from "@/components/om/primitives/Field";
import { useConfirm } from "@/components/om/primitives/ConfirmDialog";
import { toast } from "@/lib/om/toast";
import { emailApi, type CampaignSource, type ManualRecipient, type SendCampaignBody } from "@/lib/api/email";
import { useEmailAccounts } from "@/components/settings/hooks";
import { cn } from "@/lib/utils";

// "csv" is a UI-only mode -- the backend only knows manual/leads/customers,
// so a CSV import just fills the same manual-recipient list a pasted list
// would, and sends with source: "manual" (see `backendSource` below).
type SendToMode = CampaignSource | "csv";

const SOURCES: { key: SendToMode; label: string; hint: string }[] = [
  { key: "leads", label: "Leads", hint: "Everyone in Lead Generator with an email address" },
  { key: "customers", label: "CRM customers", hint: "Everyone in your CRM with an email address" },
  { key: "manual", label: "Paste a list", hint: "One email per line (optionally: email, Name)" },
  { key: "csv", label: "Upload CSV", hint: "A spreadsheet export with an email column" },
];

export default function BulkEmailPage() {
  const qc = useQueryClient();
  const { confirm, dialog } = useConfirm();
  const { data: accountsData } = useEmailAccounts();
  const accounts = accountsData?.items ?? [];
  const defaultAccount = accounts.find((a) => a.is_default) ?? accounts[0];

  const [source, setSource] = useState<SendToMode>("leads");
  const [manual, setManual] = useState("");
  const [csvRecipients, setCsvRecipients] = useState<ManualRecipient[]>([]);
  const [csvFileName, setCsvFileName] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [accountId, setAccountId] = useState("");
  const [replyTo, setReplyTo] = useState("");
  const [replyToTouched, setReplyToTouched] = useState(false);

  useEffect(() => {
    if (!accountId && defaultAccount) setAccountId(defaultAccount.id);
  }, [defaultAccount, accountId]);

  // Prefill "replies go to" from the chosen account's own reply-to, until the
  // user types their own. Blank falls back to that same address on the server.
  const selectedAccount = accounts.find((a) => a.id === accountId);
  useEffect(() => {
    if (!replyToTouched) setReplyTo(selectedAccount?.reply_to ?? "");
  }, [selectedAccount?.reply_to, replyToTouched]);

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

  // "csv" is only a UI mode -- the backend sends with source: "manual" either
  // way, just with a different origin for the recipient list.
  const backendSource: CampaignSource = source === "csv" ? "manual" : source;
  const effectiveManual = source === "csv" ? csvRecipients : source === "manual" ? manualRecipients : undefined;

  const previewBody = { source: backendSource, manual: backendSource === "manual" ? effectiveManual : undefined };
  const { data: preview, isFetching: previewing } = useQuery({
    queryKey: ["email-recipients", source, source === "manual" ? manual : "", source === "csv" ? csvRecipients : ""],
    queryFn: () => emailApi.previewRecipients(previewBody),
  });

  const importCsv = useMutation({
    mutationFn: (file: File) => emailApi.importCsv(file),
    onSuccess: (r) => {
      setCsvRecipients(r.recipients);
      toast.ok(`Imported ${r.imported} email${r.imported === 1 ? "" : "s"}${r.skipped ? ` · ${r.skipped} skipped` : ""}`);
    },
    onError: (e: Error) => {
      toast.err(e.message);
      setCsvFileName("");
    },
  });

  const { data: history } = useQuery({ queryKey: ["email-campaigns"], queryFn: emailApi.campaigns });

  const [expandedCampaign, setExpandedCampaign] = useState<string | null>(null);
  const { data: campaignSends, isFetching: sendsLoading } = useQuery({
    queryKey: ["email-campaign-sends", expandedCampaign],
    queryFn: () => emailApi.campaignSends(expandedCampaign!),
    enabled: !!expandedCampaign,
  });

  const send = useMutation({
    mutationFn: (b: SendCampaignBody) => emailApi.sendCampaign(b),
    onSuccess: (row) => {
      qc.invalidateQueries({ queryKey: ["email-campaigns"] });
      qc.invalidateQueries({ queryKey: ["email-accounts"] });
      toast.ok(`Sent ${row.sent}/${row.total} · ${row.failed} failed`);
      setSubject("");
      setBody("");
      setManual("");
      setCsvRecipients([]);
      setCsvFileName("");
    },
    onError: (e: Error) => toast.err(e.message),
  });

  const count = preview?.count ?? 0;
  const acct = accounts.find((a) => a.id === accountId);
  const remaining = acct ? Math.max(0, acct.daily_limit - acct.sent_today) : 0;

  const replyDest = replyTo.trim() || acct?.reply_to || acct?.from_email || "";

  const doSend = async () => {
    if (!subject.trim() || !body.trim()) return toast.err("Add a subject and a message");
    if (!count) return toast.err("No recipients");
    if (!acct) return toast.err("Choose a sending account");
    if (replyTo.trim() && !replyTo.trim().includes("@"))
      return toast.err("The 'replies go to' address isn't a valid email");
    const ok = await confirm({
      title: `Send to ${count} recipient${count === 1 ? "" : "s"}?`,
      message: `From ${acct.from_email}. Replies land with ${replyDest}.${
        count > remaining ? ` Only ${remaining} left in today's limit — the rest will be skipped.` : ""
      }`,
      confirmLabel: "Send now",
    });
    if (!ok) return;
    send.mutate({
      subject,
      body,
      email_account_id: accountId,
      source: backendSource,
      manual: backendSource === "manual" ? effectiveManual : undefined,
      reply_to: replyTo.trim() || undefined,
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
              <OmSelect value={source} onChange={(e) => setSource(e.target.value as SendToMode)}>
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

            {source === "csv" && (
              <Field label="Recipients" hint="A .csv export with an email column (and optionally a name column) — we'll find them automatically.">
                <label className="flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-dashed border-om-border px-2.5 py-3 text-[11.5px] text-om-muted hover:border-om-blue/40 hover:text-om-dim">
                  <input
                    type="file"
                    accept=".csv,text/csv,text/plain"
                    hidden
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      if (!file) return;
                      setCsvFileName(file.name);
                      importCsv.mutate(file);
                    }}
                  />
                  {importCsv.isPending ? (
                    <>
                      <Loader2 className="size-3.5 animate-spin" /> Importing…
                    </>
                  ) : csvRecipients.length ? (
                    <>
                      <Upload className="size-3.5" /> {csvFileName} · {csvRecipients.length} email
                      {csvRecipients.length === 1 ? "" : "s"} — click to replace
                    </>
                  ) : (
                    <>
                      <Upload className="size-3.5" /> Click to choose a CSV file
                    </>
                  )}
                </label>
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

            <Field
              label="Replies go to"
              hint="Every reply from a customer — Reply or Reply All — lands here. Leave blank to use the sending account's own address."
            >
              <div className="flex items-center gap-1.5">
                <OmInput
                  type="email"
                  value={replyTo}
                  onChange={(e) => {
                    setReplyTo(e.target.value);
                    setReplyToTouched(true);
                  }}
                  placeholder={selectedAccount?.from_email ?? "person@yourcompany.com"}
                />
                {replyToTouched && replyTo !== (selectedAccount?.reply_to ?? "") && (
                  <button
                    type="button"
                    onClick={() => {
                      setReplyToTouched(false);
                      setReplyTo(selectedAccount?.reply_to ?? "");
                    }}
                    className="shrink-0 text-[10.5px] text-om-muted hover:text-om-text"
                  >
                    reset
                  </button>
                )}
              </div>
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

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-om-border pt-2">
              <div className="flex flex-col gap-0.5 text-[11px] text-om-muted">
                <span className="flex items-center gap-1.5">
                  <Users className="size-3.5" />
                  {previewing ? "counting…" : `${count} recipient${count === 1 ? "" : "s"}`}
                  {acct && ` · ${remaining} left today`}
                </span>
                {replyDest && (
                  <span className="flex items-center gap-1.5 text-om-faint">
                    <Mail className="size-3" /> replies → {replyDest}
                  </span>
                )}
              </div>
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
                  {history.map((c) => {
                    const open = expandedCampaign === c.id;
                    return (
                      <li key={c.id} className="py-1.5">
                        <button
                          type="button"
                          onClick={() => setExpandedCampaign(open ? null : c.id)}
                          className="flex w-full items-center justify-between gap-2 text-left"
                        >
                          <span className="flex min-w-0 flex-col">
                            <span className="truncate text-[11.5px]">{c.subject}</span>
                            {c.reply_to && (
                              <span className="truncate text-[9.5px] text-om-faint">
                                replies → {c.reply_to}
                              </span>
                            )}
                          </span>
                          <span className="flex shrink-0 items-center gap-1">
                            <StatusBadge tone={c.failed ? "amber" : "green"}>
                              {c.sent}/{c.total}
                            </StatusBadge>
                            <ChevronDown className={cn("size-3.5 text-om-faint transition-transform", open && "rotate-180")} />
                          </span>
                        </button>
                        {open && (
                          <div className="mt-1.5 rounded-lg border border-om-border bg-white/[0.02] p-1.5">
                            {sendsLoading ? (
                              <p className="flex items-center gap-1.5 py-1 text-[10.5px] text-om-muted">
                                <Loader2 className="size-3 animate-spin" /> Loading…
                              </p>
                            ) : campaignSends?.length ? (
                              <ul className="flex flex-col gap-1">
                                {campaignSends.map((s, i) => (
                                  <li key={i} className="flex items-start gap-1.5 text-[10.5px]">
                                    {s.status === "sent" ? (
                                      <CheckCircle2 className="mt-0.5 size-3 shrink-0 text-om-green" />
                                    ) : s.status === "skipped" ? (
                                      <MinusCircle className="mt-0.5 size-3 shrink-0 text-om-faint" />
                                    ) : (
                                      <XCircle className="mt-0.5 size-3 shrink-0 text-om-red" />
                                    )}
                                    <span className="min-w-0 flex-1">
                                      <span className="truncate text-om-dim">{s.to_email}</span>
                                      {s.error && <span className="block text-om-red">{s.error}</span>}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <p className="py-1 text-[10.5px] text-om-muted">No send records.</p>
                            )}
                          </div>
                        )}
                      </li>
                    );
                  })}
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
