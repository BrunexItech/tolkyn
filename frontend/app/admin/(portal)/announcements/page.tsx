"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Megaphone, Send, Users, Loader2 } from "lucide-react";
import { SectionHeading } from "@/components/om/primitives/SectionHeading";
import { Card } from "@/components/om/primitives/Card";
import { EmptyState } from "@/components/om/primitives/EmptyState";
import { OmButton } from "@/components/om/primitives/OmButton";
import { StatusBadge } from "@/components/om/primitives/StatusBadge";
import { Field, OmInput, OmSelect, OmTextarea } from "@/components/om/primitives/Field";
import { useConfirm } from "@/components/om/primitives/ConfirmDialog";
import { adminApi, type AnnouncementAudience } from "@/lib/api/admin";
import { useAnnouncements, useSendAnnouncement, usePackages } from "@/components/admin/hooks";

export default function AdminAnnouncementsPage() {
  const { confirm, dialog } = useConfirm();
  const { data: history } = useAnnouncements();
  const { data: pkgData } = usePackages();
  const send = useSendAnnouncement();

  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [approval, setApproval] = useState("");
  const [statusF, setStatusF] = useState("");
  const [packageId, setPackageId] = useState("");

  const audience: AnnouncementAudience = useMemo(() => {
    const a: AnnouncementAudience = {};
    if (approval) a.approval = approval as "approved" | "pending";
    if (statusF) a.status = statusF;
    if (packageId) a.package_id = packageId;
    return a;
  }, [approval, statusF, packageId]);

  const { data: preview, isFetching } = useQuery({
    queryKey: ["admin-announce-preview", audience, subject, body],
    queryFn: () => adminApi.previewAnnouncement({ subject: subject || "x", body: body || "x", audience }),
    enabled: true,
  });

  const doSend = async () => {
    if (!subject.trim() || !body.trim()) return;
    const n = preview?.count ?? 0;
    const ok = await confirm({
      title: `Email ${n} user${n === 1 ? "" : "s"}?`,
      message: `Audience: ${preview?.audience ?? "—"}. Sends from the Tolkyn platform address. This can't be undone.`,
      confirmLabel: "Send announcement",
      danger: true,
    });
    if (!ok) return;
    send.mutate(
      { subject, body, audience: audience as Record<string, unknown> },
      { onSuccess: () => { setSubject(""); setBody(""); } },
    );
  };

  return (
    <div className="space-y-3">
      <SectionHeading
        title="Announcements"
        subtitle="Email your registered users — one message, sent from the Tolkyn address."
        icon={<Megaphone />}
      />

      <div className="grid gap-3 lg:grid-cols-[1fr_300px]">
        <Card className="flex flex-col gap-2">
          <div className="grid gap-2 sm:grid-cols-3">
            <Field label="Approval">
              <OmSelect value={approval} onChange={(e) => setApproval(e.target.value)}>
                <option value="">Any</option>
                <option value="approved">Approved</option>
                <option value="pending">Pending</option>
              </OmSelect>
            </Field>
            <Field label="Status">
              <OmSelect value={statusF} onChange={(e) => setStatusF(e.target.value)}>
                <option value="">Any</option>
                <option value="active">Active</option>
                <option value="suspended">Suspended</option>
              </OmSelect>
            </Field>
            <Field label="Package">
              <OmSelect value={packageId} onChange={(e) => setPackageId(e.target.value)}>
                <option value="">Any</option>
                {(pkgData?.items ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </OmSelect>
            </Field>
          </div>

          <Field label="Subject">
            <OmInput value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Product update" />
          </Field>
          <Field label="Message" hint="Merge field: {name} (recipient's first name)">
            <OmTextarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={"Hi {name},\n\nWe've shipped…"}
              className="min-h-[180px]"
            />
          </Field>

          <div className="flex items-center justify-between border-t border-om-border pt-2">
            <span className="flex items-center gap-1.5 text-[11px] text-om-muted">
              <Users className="size-3.5" />
              {isFetching ? "counting…" : `${preview?.count ?? 0} recipients · ${preview?.audience ?? ""}`}
            </span>
            <OmButton
              variant="solid"
              size="sm"
              onClick={doSend}
              disabled={send.isPending || !subject.trim() || !body.trim() || !preview?.count}
            >
              {send.isPending ? <Loader2 className="animate-spin" /> : <Send />} Send announcement
            </OmButton>
          </div>
        </Card>

        <Card className="flex flex-col gap-1.5">
          <div className="text-[12px] font-semibold">History</div>
          {history?.length ? (
            <ul className="flex flex-col divide-y divide-white/[0.05]">
              {history.map((a) => (
                <li key={a.id} className="py-2">
                  <div className="truncate text-[11.5px] font-medium">{a.subject}</div>
                  <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-om-muted">
                    <StatusBadge tone={a.failed ? "amber" : "green"}>
                      {a.sent}/{a.total}
                    </StatusBadge>
                    {a.audience}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="No announcements yet" />
          )}
        </Card>
      </div>
      {dialog}
    </div>
  );
}
