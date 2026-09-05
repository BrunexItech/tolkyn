"use client";

import { useEffect, useState } from "react";
import { Loader2, TriangleAlert } from "lucide-react";
import { Modal } from "@/components/om/primitives/Modal";
import { Field, OmInput } from "@/components/om/primitives/Field";
import { OmButton } from "@/components/om/primitives/OmButton";
import { useCreateEmailAccount, useUpdateEmailAccount } from "./hooks";
import type { EmailAccount } from "@/lib/api/email";
import { cn } from "@/lib/utils";

const PRESETS: Record<string, { host: string; port: number; tls: boolean; ssl: boolean }> = {
  Gmail: { host: "smtp.gmail.com", port: 587, tls: true, ssl: false },
  "Outlook / Microsoft 365": { host: "smtp.office365.com", port: 587, tls: true, ssl: false },
  Zoho: { host: "smtp.zoho.com", port: 465, tls: false, ssl: true },
  Fastmail: { host: "smtp.fastmail.com", port: 465, tls: false, ssl: true },
  Custom: { host: "", port: 587, tls: true, ssl: false },
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const blankForm = {
  label: "",
  from_name: "",
  from_email: "",
  smtp_host: PRESETS.Gmail.host,
  smtp_port: 587,
  smtp_username: "",
  smtp_password: "",
  use_tls: true,
  use_ssl: false,
  signature: "",
  daily_limit: 200,
};

export function EmailAccountDialog({
  open,
  onOpenChange,
  account,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  account?: EmailAccount | null;
}) {
  const editing = !!account;
  const create = useCreateEmailAccount();
  const update = useUpdateEmailAccount();
  const busy = create.isPending || update.isPending;

  const [preset, setPreset] = useState("Gmail");
  const [form, setForm] = useState(blankForm);
  const [touched, setTouched] = useState(false);

  // reset the form whenever the dialog opens (for a new account or a different one)
  useEffect(() => {
    if (!open) return;
    setTouched(false);
    if (account) {
      setForm({
        label: account.label ?? "",
        from_name: account.from_name ?? "",
        from_email: account.from_email ?? "",
        smtp_host: account.smtp_host ?? PRESETS.Gmail.host,
        smtp_port: account.smtp_port ?? 587,
        smtp_username: account.smtp_username ?? "",
        smtp_password: "",
        use_tls: account.use_tls ?? true,
        use_ssl: account.use_ssl ?? false,
        signature: account.signature ?? "",
        daily_limit: account.daily_limit ?? 200,
      });
      const match = Object.entries(PRESETS).find(([, p]) => p.host === account.smtp_host);
      setPreset(match ? match[0] : "Custom");
    } else {
      setForm(blankForm);
      setPreset("Gmail");
    }
  }, [open, account]);

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const applyPreset = (name: string) => {
    setPreset(name);
    const p = PRESETS[name];
    setForm((f) => ({ ...f, smtp_host: p.host, smtp_port: p.port, use_tls: p.tls, use_ssl: p.ssl }));
  };

  // ---- validation ----
  const errors: Record<string, string> = {};
  if (!form.label.trim()) errors.label = "Give this account a name";
  if (!form.from_email.trim()) errors.from_email = "Required";
  else if (!EMAIL_RE.test(form.from_email.trim())) errors.from_email = "Not a valid email";
  if (!form.smtp_host.trim()) errors.smtp_host = "Required";
  if (!(Number(form.smtp_port) > 0)) errors.smtp_port = "Invalid";
  if (!editing && !form.smtp_password.trim()) errors.smtp_password = "Required to connect";
  const hasErrors = Object.keys(errors).length > 0;

  const submit = () => {
    setTouched(true);
    if (hasErrors) return;
    const payload = {
      label: form.label.trim(),
      from_name: form.from_name.trim() || form.label.trim(),
      from_email: form.from_email.trim(),
      smtp_host: form.smtp_host.trim(),
      smtp_port: Number(form.smtp_port),
      smtp_username: form.smtp_username.trim() || form.from_email.trim(),
      use_tls: form.use_tls,
      use_ssl: form.use_ssl,
      signature: form.signature.trim() || undefined,
      daily_limit: Number(form.daily_limit) || 200,
      ...(form.smtp_password ? { smtp_password: form.smtp_password } : {}),
    };
    const done = { onSuccess: () => onOpenChange(false) };
    if (editing) update.mutate({ id: account!.id, ...payload }, done);
    else create.mutate({ ...payload, is_default: false }, done);
  };

  const show = (k: string) => touched && errors[k];
  const errCls = (k: string) =>
    show(k) ? "border-om-red/60 focus:border-om-red/60" : "";

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? "Edit sending account" : "Add a sending account"}
      description="Connect a business email so Tolkyn can send outreach from your address."
      footer={
        <>
          <OmButton variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </OmButton>
          <OmButton variant="solid" size="sm" onClick={submit} disabled={busy}>
            {busy && <Loader2 className="animate-spin" />}
            {editing ? "Save" : "Add account"}
          </OmButton>
        </>
      }
    >
      <div className="space-y-1">
        {touched && hasErrors && (
          <div className="mb-2 flex items-center gap-1.5 rounded-md border border-om-red/30 bg-om-red/[0.07] px-2.5 py-1.5 text-[11px] text-om-red">
            <TriangleAlert className="size-3.5 shrink-0" />
            Fill the highlighted fields to continue.
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Label">
            <OmInput
              value={form.label}
              onChange={(e) => set("label", e.target.value)}
              placeholder="Sales inbox"
              className={errCls("label")}
            />
            {show("label") && <p className="mt-1 text-[10px] text-om-red">{errors.label}</p>}
          </Field>
          <Field label="Provider">
            <select
              value={preset}
              onChange={(e) => applyPreset(e.target.value)}
              className="w-full rounded-lg border border-om-border bg-white/[0.03] px-2.5 py-2 text-[12.5px] text-om-text outline-none focus:border-om-blue/60"
            >
              {Object.keys(PRESETS).map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="From name">
            <OmInput
              value={form.from_name}
              onChange={(e) => set("from_name", e.target.value)}
              placeholder="Sam Rivera"
            />
          </Field>
          <Field label="From email">
            <OmInput
              type="email"
              value={form.from_email}
              onChange={(e) => set("from_email", e.target.value)}
              placeholder="sam@yourdomain.com"
              className={errCls("from_email")}
            />
            {show("from_email") && (
              <p className="mt-1 text-[10px] text-om-red">{errors.from_email}</p>
            )}
          </Field>
        </div>
        <div className="grid grid-cols-[1fr_90px] gap-3">
          <Field label="SMTP host">
            <OmInput
              value={form.smtp_host}
              onChange={(e) => set("smtp_host", e.target.value)}
              placeholder="smtp.gmail.com"
              className={errCls("smtp_host")}
            />
          </Field>
          <Field label="Port">
            <OmInput
              type="number"
              value={form.smtp_port}
              onChange={(e) => set("smtp_port", Number(e.target.value))}
              className={errCls("smtp_port")}
            />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Username">
            <OmInput
              value={form.smtp_username}
              onChange={(e) => set("smtp_username", e.target.value)}
              placeholder="usually your full email"
            />
          </Field>
          <Field label={editing ? "App password (leave blank to keep)" : "App password"}>
            <OmInput
              type="password"
              value={form.smtp_password}
              onChange={(e) => set("smtp_password", e.target.value)}
              placeholder="16-char app password"
              className={errCls("smtp_password")}
            />
            {show("smtp_password") && (
              <p className="mt-1 text-[10px] text-om-red">{errors.smtp_password}</p>
            )}
          </Field>
        </div>
        <div className="flex items-center gap-4 pb-1 text-[11.5px]">
          <label className="flex cursor-pointer items-center gap-1.5 text-om-dim">
            <input
              type="checkbox"
              checked={form.use_tls}
              onChange={(e) => set("use_tls", e.target.checked)}
              className="size-3.5 accent-om-blue"
            />
            STARTTLS (587)
          </label>
          <label className="flex cursor-pointer items-center gap-1.5 text-om-dim">
            <input
              type="checkbox"
              checked={form.use_ssl}
              onChange={(e) => set("use_ssl", e.target.checked)}
              className="size-3.5 accent-om-blue"
            />
            SSL (465)
          </label>
        </div>
        <Field label="Signature (optional)">
          <textarea
            value={form.signature}
            onChange={(e) => set("signature", e.target.value)}
            rows={2}
            className="w-full rounded-lg border border-om-border bg-white/[0.03] px-2.5 py-2 text-[12px] text-om-text outline-none focus:border-om-blue/60"
            placeholder={"Sam Rivera\nCrumb & Co · crumbco.com"}
          />
        </Field>
        <p
          className={cn(
            "rounded-md border border-om-amber/25 bg-om-amber/[0.07] px-2.5 py-1.5 text-[10.5px] text-om-amber",
          )}
        >
          Gmail / Outlook need an <b>App Password</b> (with 2‑step verification on), not your
          login password. For inbox delivery, your domain needs SPF + DKIM records.
        </p>
      </div>
    </Modal>
  );
}
