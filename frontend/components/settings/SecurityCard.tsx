"use client";

import { useState } from "react";
import { Eye, EyeOff, KeyRound, Loader2, ShieldCheck } from "lucide-react";
import { Card, CardTitle } from "@/components/om/primitives/Card";
import { OmButton } from "@/components/om/primitives/OmButton";
import { Field, OmInput } from "@/components/om/primitives/Field";
import { useChangePassword } from "./hooks";

const EMPTY = { current: "", next: "", confirm: "" };

export function SecurityCard() {
  const change = useChangePassword();
  const [form, setForm] = useState(EMPTY);
  const [show, setShow] = useState(false);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const tooShort = form.next.length > 0 && form.next.length < 8;
  const mismatch = form.confirm.length > 0 && form.next !== form.confirm;
  const canSubmit =
    form.current.length > 0 && form.next.length >= 8 && form.next === form.confirm && !change.isPending;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    change.mutate(
      {
        current_password: form.current,
        new_password: form.next,
        new_password_confirm: form.confirm,
      },
      { onSuccess: () => setForm(EMPTY) },
    );
  };

  return (
    <Card>
      <CardTitle icon={<ShieldCheck />}>Password</CardTitle>

      <form onSubmit={submit} className="mt-2">
        <Field label="Current password">
          <div className="relative">
            <OmInput
              type={show ? "text" : "password"}
              value={form.current}
              onChange={set("current")}
              autoComplete="current-password"
              className="pr-9"
            />
            <button
              type="button"
              onClick={() => setShow((s) => !s)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-om-muted hover:text-om-text"
              aria-label={show ? "Hide passwords" : "Show passwords"}
            >
              {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
        </Field>

        <Field
          label="New password"
          hint={
            <span className={tooShort ? "text-om-red" : undefined}>
              At least 8 characters.
            </span>
          }
        >
          <OmInput
            type={show ? "text" : "password"}
            value={form.next}
            onChange={set("next")}
            autoComplete="new-password"
          />
        </Field>

        <Field
          label="Confirm new password"
          hint={mismatch ? <span className="text-om-red">Passwords don&apos;t match.</span> : undefined}
        >
          <OmInput
            type={show ? "text" : "password"}
            value={form.confirm}
            onChange={set("confirm")}
            autoComplete="new-password"
          />
        </Field>

        <OmButton type="submit" variant="solid" size="sm" className="mt-1" disabled={!canSubmit}>
          {change.isPending ? <Loader2 className="animate-spin" /> : <KeyRound />}
          Update password
        </OmButton>
        <p className="mt-2 text-[10.5px] leading-relaxed text-om-faint">
          Changing your password keeps you signed in on this device. Other sessions stay active until
          their token expires.
        </p>
      </form>
    </Card>
  );
}
