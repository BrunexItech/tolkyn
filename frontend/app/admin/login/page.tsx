"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldAlert, Loader2, ArrowRight } from "lucide-react";
import { adminApi, AdminApiError } from "@/lib/api/admin";
import { OmButton } from "@/components/om/primitives/OmButton";
import { Field, OmInput } from "@/components/om/primitives/Field";

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

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
          <p className="mt-3 rounded-lg border border-om-red/25 bg-om-red/10 px-3 py-2 text-[11.5px] text-om-red">
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
