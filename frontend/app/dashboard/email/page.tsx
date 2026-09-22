"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Mail, Send, Users, Loader2, Info, Settings2, Upload, ChevronDown, CheckCircle2, XCircle, MinusCircle, Inbox, Search, Trash2, Reply as ReplyIcon } from "lucide-react";
import { SectionHeading } from "@/components/om/primitives/SectionHeading";
import { Card, CardTitle } from "@/components/om/primitives/Card";
import { Modal } from "@/components/om/primitives/Modal";
import { OmButton } from "@/components/om/primitives/OmButton";
import { EmptyState } from "@/components/om/primitives/EmptyState";
import { StatusBadge } from "@/components/om/primitives/StatusBadge";
import { Field, OmInput, OmSelect, OmTextarea } from "@/components/om/primitives/Field";
import { useConfirm } from "@/components/om/primitives/ConfirmDialog";
import { toast } from "@/lib/om/toast";
import { emailApi, type CampaignSource, type ManualRecipient, type ReplyRow, type SendCampaignBody } from "@/lib/api/email";
import { useEmailAccounts } from "@/components/settings/hooks";
import { cn } from "@/lib/utils";
import { relativeTime } from "@/lib/om/format";

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
  const { data: preview, isFetching: previewing, error: previewError } = useQuery({
    queryKey: ["email-recipients", source, source === "manual" ? manual : "", source === "csv" ? csvRecipients : ""],
    queryFn: () => emailApi.previewRecipients(previewBody),
    // Leads/CRM customers can change between visits to this page -- always
    // refetch rather than silently showing a cached (possibly stale/wrong)
    // count from earlier in the session.
    staleTime: 0,
    refetchOnMount: "always",
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

  const deleteCampaign = useMutation({
    mutationFn: (id: string) => emailApi.deleteCampaign(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["email-campaigns"] });
      toast.ok("Deleted");
    },
    onError: (e: Error) => toast.err(e.message),
  });

  const REPLIES_PAGE = 20;
  const [replySearch, setReplySearch] = useState("");
  const [repliesShown, setRepliesShown] = useState(REPLIES_PAGE);
  useEffect(() => setRepliesShown(REPLIES_PAGE), [replySearch]);
  const { data: replies, isFetching: repliesLoading } = useQuery({
    queryKey: ["email-replies", replySearch, repliesShown],
    queryFn: () => emailApi.replies({ search: replySearch.trim() || undefined, limit: repliesShown }),
    refetchInterval: 60_000,
  });
  const { data: unread } = useQuery({
    queryKey: ["email-replies-unread"],
    queryFn: emailApi.unreadReplyCount,
    refetchInterval: 60_000,
  });
  const markRead = useMutation({
    mutationFn: (id: string) => emailApi.markReplyRead(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["email-replies"] });
      qc.invalidateQueries({ queryKey: ["email-replies-unread"] });
    },
  });
  const deleteReply = useMutation({
    mutationFn: (id: string) => emailApi.deleteReply(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["email-replies"] });
      qc.invalidateQueries({ queryKey: ["email-replies-unread"] });
      setOpenReply(null);
      toast.ok("Deleted");
    },
    onError: (e: Error) => toast.err(e.message),
  });
  const [openReply, setOpenReply] = useState<ReplyRow | null>(null);
  const viewReply = (r: ReplyRow) => {
    setOpenReply(r);
    if (!r.is_read) markRead.mutate(r.id);
  };

  const [replyDraft, setReplyDraft] = useState("");
  const [replyBoxOpen, setReplyBoxOpen] = useState(false);
  const sendReply = useMutation({
    mutationFn: () => emailApi.replyToMessage(openReply!.id, replyDraft),
    onSuccess: (r) => {
      toast.ok(`Sent to ${r.to}`);
      setReplyDraft("");
      setReplyBoxOpen(false);
    },
    onError: (e: Error) => toast.err(e.message),
  });

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
              {previewError ? (
                <p className="text-[11px] text-om-red">
                  Couldn&apos;t load recipients: {(previewError as Error).message}
                </p>
              ) : previewing ? (
                <p className="flex items-center gap-1.5 text-[11px] text-om-muted">
                  <Loader2 className="size-3 animate-spin" /> Checking…
                </p>
              ) : preview?.sample?.length ? (
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
              <CardTitle icon={<Inbox />}>
                Replies
                {!!unread?.count && (
                  <span className="ml-1.5 rounded-full bg-om-blue/15 px-1.5 py-px text-[9.5px] font-semibold text-om-blue">
                    {unread.count} new
                  </span>
                )}
              </CardTitle>
              <div className="relative mb-1">
                <Search className="pointer-events-none absolute left-2 top-1/2 size-3 -translate-y-1/2 text-om-faint" />
                <OmInput
                  value={replySearch}
                  onChange={(e) => setReplySearch(e.target.value)}
                  placeholder="Search replies…"
                  className="pl-6 text-[11px]"
                />
              </div>
              {replies?.length ? (
                <>
                  <ul className="flex flex-col divide-y divide-white/[0.05]">
                    {replies.map((r) => (
                      <li key={r.id}>
                        <button
                          type="button"
                          onClick={() => viewReply(r)}
                          className="flex w-full flex-col gap-0.5 py-1.5 text-left"
                        >
                          <span className="flex items-center gap-1.5">
                            {!r.is_read && <span className="size-1.5 shrink-0 rounded-full bg-om-blue" />}
                            <span className={cn("truncate text-[11px]", !r.is_read ? "font-semibold text-om-text" : "text-om-dim")}>
                              {r.from_name || r.from_email}
                            </span>
                            {r.received_at && (
                              <span className="ml-auto shrink-0 text-[9.5px] text-om-faint">{relativeTime(r.received_at)}</span>
                            )}
                          </span>
                          {r.subject && <span className="truncate text-[10.5px] text-om-muted">{r.subject}</span>}
                          {r.body_preview && (
                            <span className="line-clamp-1 text-[10px] text-om-faint">{r.body_preview}</span>
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                  {replies.length >= repliesShown && (
                    <button
                      type="button"
                      onClick={() => setRepliesShown((n) => n + REPLIES_PAGE)}
                      disabled={repliesLoading}
                      className="mt-1 flex items-center justify-center gap-1.5 rounded-lg border border-om-border py-1.5 text-[10.5px] text-om-muted hover:border-om-blue/40 hover:text-om-dim disabled:opacity-50"
                    >
                      {repliesLoading ? <Loader2 className="size-3 animate-spin" /> : null} Load more
                    </button>
                  )}
                </>
              ) : (
                <p className="text-[11px] text-om-muted">
                  {replySearch
                    ? "No replies match that search."
                    : "No replies yet — we check your sending accounts' inboxes every few minutes."}
                </p>
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
                        <div className="flex w-full items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setExpandedCampaign(open ? null : c.id)}
                            className="flex min-w-0 flex-1 items-center justify-between gap-2 text-left"
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
                          <button
                            type="button"
                            onClick={async () => {
                              const ok = await confirm({
                                title: "Delete this send?",
                                message: `"${c.subject}" and its ${c.total} recipient record${c.total === 1 ? "" : "s"} will be permanently removed.`,
                                confirmLabel: "Delete",
                                danger: true,
                              });
                              if (ok) deleteCampaign.mutate(c.id);
                            }}
                            className="shrink-0 rounded-md p-1 text-om-faint hover:bg-om-red/10 hover:text-om-red"
                            title="Delete"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </div>
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

      <Modal
        open={!!openReply}
        onOpenChange={(o) => {
          if (!o) {
            setOpenReply(null);
            setReplyBoxOpen(false);
            setReplyDraft("");
          }
        }}
        title={openReply?.subject || "(no subject)"}
        description={
          openReply
            ? `From ${openReply.from_name ? `${openReply.from_name} · ` : ""}${openReply.from_email}${
                openReply.received_at ? ` · ${relativeTime(openReply.received_at)}` : ""
              }`
            : undefined
        }
        footer={
          openReply && (
            <>
              <button
                type="button"
                onClick={async () => {
                  const ok = await confirm({
                    title: "Delete this reply?",
                    message: "It will be permanently removed.",
                    confirmLabel: "Delete",
                    danger: true,
                  });
                  if (ok) deleteReply.mutate(openReply.id);
                }}
                className="mr-auto rounded-md p-1.5 text-om-faint hover:bg-om-red/10 hover:text-om-red"
                title="Delete"
              >
                <Trash2 className="size-4" />
              </button>
              <OmButton variant="outline" size="sm" onClick={() => setReplyBoxOpen((s) => !s)}>
                <ReplyIcon className="size-3.5" /> Reply
              </OmButton>
            </>
          )
        }
      >
        {/* Untrusted mail content -- sandbox with no allow-scripts so nothing
            in the message can execute, regardless of what it contains. */}
        {openReply?.body_html ? (
          <iframe
            title="Email content"
            sandbox="allow-same-origin"
            srcDoc={openReply.body_html}
            className="h-[320px] w-full rounded-lg border border-om-border bg-white"
          />
        ) : (
          <div className="whitespace-pre-wrap text-[12.5px] leading-relaxed text-om-dim">
            {openReply?.body_preview || "(no message content)"}
          </div>
        )}

        {!!openReply?.attachments?.length && (
          <div className="mt-3 flex flex-wrap gap-2">
            {openReply.attachments.map((a, i) => (
              <a
                key={i}
                href={a.url}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 rounded-lg border border-om-border bg-white/[0.02] px-2 py-1.5 text-[10.5px] text-om-dim hover:border-om-blue/40"
              >
                {a.content_type.startsWith("image/") ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={a.url} alt={a.filename} className="size-8 rounded object-cover" />
                ) : (
                  <Mail className="size-3.5" />
                )}
                <span className="max-w-[120px] truncate">{a.filename}</span>
              </a>
            ))}
          </div>
        )}

        {replyBoxOpen && (
          <div className="mt-3 flex flex-col gap-1.5 border-t border-om-border pt-3">
            <OmTextarea
              value={replyDraft}
              onChange={(e) => setReplyDraft(e.target.value)}
              placeholder={`Reply to ${openReply?.from_name || openReply?.from_email}…`}
              className="min-h-[90px]"
              autoFocus
            />
            <OmButton
              variant="solid"
              size="sm"
              className="self-end"
              disabled={!replyDraft.trim() || sendReply.isPending}
              onClick={() => sendReply.mutate()}
            >
              {sendReply.isPending ? <Loader2 className="animate-spin" /> : <Send />} Send reply
            </OmButton>
          </div>
        )}
      </Modal>
    </div>
  );
}
