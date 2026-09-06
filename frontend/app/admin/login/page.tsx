"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ShieldAlert, Loader2, ArrowRight } from "lucide-react";
import { adminApi, AdminApiError } from "@/lib/api/admin";
import { OmButton } from "@/components/om/primitives/OmButton";
import { Field, OmInput } from "@/components/om/primitives/Field";

function AdminLoginInner() {
  const router = useRouter();
  const expired = useSearchParams().get("expired") === "1";
  const EXPIRED_MSG = "Your session expired. Please sign in again.";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(expired ? EXPIRED_MSG : "");
  const [busy, setBusy] = useState(false);
  const isInfo = error === EXPIRED_MSG;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const res = await adminApi.login(email.trim(), password);
      localStorage.setItem("admin_access_token", res.access_token);
      document.cookie = `admin_access_token=${res.access_token}; path=/; max-age=${res.expires_in}`;
      router.push("/admin");
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-2xl border border-om-border bg-om-card p-6 shadow-2xl"
      >
        <div className="mb-1 flex items-center gap-2">
          <span className="grid size-8 place-items-center rounded-lg bg-om-violet/15 text-om-violet">
            <ShieldAlert className="size-4" />
          </span>
          <div className="text-[13px] font-bold tracking-tight">Tolkyn</div>
        </div>
        <h1 className="mt-3 text-[16px] font-semibold text-om-text">Platform Control</h1>
        <p className="mt-1 text-[11.5px] text-om-muted">
          Restricted to platform operators. Not the account login.
        </p>

        <div className="mt-5 space-y-3">
          <Field label="Email">
            <OmInput
              type="email"
              autoFocus
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@tolkyn.co.ke"
            />
          </Field>
          <Field label="Password">
            <OmInput
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••"
            />
          </Field>
        </div>

        {error && (
          <p
            className={
              isInfo
                ? "mt-3 rounded-lg border border-om-blue/25 bg-om-blue/10 px-3 py-2 text-[11.5px] text-om-blue"
                : "mt-3 rounded-lg border border-om-red/25 bg-om-red/10 px-3 py-2 text-[11.5px] text-om-red"
            }
          >
            {error}
          </p>
        )}

        <OmButton
          type="submit"
          variant="solid"
          size="md"
          className="mt-5 w-full justify-center"
          disabled={busy || !email || !password}
        >
          {busy ? <Loader2 className="animate-spin" /> : <ArrowRight />}
          Enter control room
        </OmButton>
      </form>
    </div>
  );
}

export default function AdminLoginPage() {
  return (
    <Suspense fallback={null}>
      <AdminLoginInner />
    </Suspense>
  );
}
