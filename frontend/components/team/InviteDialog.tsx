"use client";

import { useState } from "react";
import { Check, Copy, Loader2 } from "lucide-react";
import { Modal } from "@/components/om/primitives/Modal";
import { Field, OmInput } from "@/components/om/primitives/Field";
import { OmButton } from "@/components/om/primitives/OmButton";
import { useInviteMember } from "./hooks";
import type { RoleInfo, TeamRole } from "@/lib/api/team";
import { cn } from "@/lib/utils";

const SELECT =
  "w-full rounded-lg border border-om-border bg-white/[0.03] px-2.5 py-2 text-[12.5px] text-om-text outline-none focus:border-om-blue/60";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function InviteDialog({
  open,
  onOpenChange,
  roles,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  roles: RoleInfo[];
}) {
  const invite = useInviteMember();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [role, setRole] = useState<TeamRole>("editor");
  // Non-null only when email delivery isn't configured — the invite still
  // exists, it just needs to be shared manually instead of arriving by inbox.
  const [pendingLink, setPendingLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const assignable = roles.filter((r) => r.id !== "owner");
  const perms = roles.find((r) => r.id === role)?.permissions ?? [];

  const reset = () => {
    setEmail("");
    setName("");
    setTitle("");
    setRole("editor");
    setPendingLink(null);
    setCopied(false);
  };

  const submit = () => {
    if (!EMAIL_RE.test(email)) return;
    invite.mutate(
      { email: email.trim(), name: name.trim() || undefined, title: title.trim() || undefined, role },
      {
        onSuccess: (res) => {
          if (res.invite_link) {
            setPendingLink(res.invite_link);
          } else {
            reset();
            onOpenChange(false);
          }
        },
      },
    );
  };

  const copyLink = async () => {
    if (!pendingLink) return;
    await navigator.clipboard.writeText(pendingLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <Modal
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
      title={pendingLink ? "Share this invite" : "Invite a teammate"}
      description={
        pendingLink
          ? "Email isn't configured for this workspace, so send this link to them yourself."
          : "They get access scoped to the role you pick."
      }
      footer={
        pendingLink ? (
          <OmButton
            variant="solid"
            size="sm"
            className="ml-auto"
            onClick={() => {
              reset();
              onOpenChange(false);
            }}
          >
            Done
          </OmButton>
        ) : (
          <>
            <OmButton variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
              Cancel
            </OmButton>
            <OmButton variant="solid" size="sm" onClick={submit} disabled={invite.isPending || !EMAIL_RE.test(email)}>
              {invite.isPending && <Loader2 className="animate-spin" />} Send invite
            </OmButton>
          </>
        )
      }
    >
      {pendingLink ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2 rounded-lg border border-om-border bg-white/[0.03] px-3 py-2">
            <code className="flex-1 truncate text-[11.5px] text-om-dim">{pendingLink}</code>
            <button
              onClick={copyLink}
              className="flex shrink-0 items-center gap-1 rounded-md border border-om-border px-2 py-1 text-[10.5px] font-medium text-om-muted hover:text-om-text"
            >
              {copied ? <Check className="size-3 text-om-green" /> : <Copy className="size-3" />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <p className="text-[10.5px] text-om-faint">
            This link expires in 7 days and can only be used once.
          </p>
        </div>
      ) : (
        <div className="space-y-1">
          <Field label="Email">
            <OmInput autoFocus type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="teammate@company.com" />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Name">
              <OmInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Optional" />
            </Field>
            <Field label="Title">
              <OmInput value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Optional" />
            </Field>
          </div>
          <Field label="Role">
            <select value={role} onChange={(e) => setRole(e.target.value as TeamRole)} className={SELECT}>
              {assignable.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
          </Field>
          <div className="mt-1 flex flex-wrap gap-1">
            {perms.map((p) => (
              <span
                key={p}
                className={cn(
                  "rounded px-1.5 py-px text-[9.5px] capitalize",
                  p === "*" ? "bg-om-blue/15 text-om-blue" : "bg-white/[0.05] text-om-muted",
                )}
              >
                {p === "*" ? "full access" : p}
              </span>
            ))}
          </div>
        </div>
      )}
    </Modal>
  );
}
