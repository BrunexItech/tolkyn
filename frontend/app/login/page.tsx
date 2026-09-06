"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff, ArrowRight, Loader2, CircleAlert, Clock } from "lucide-react";
import toast from "react-hot-toast";
import { auth } from "@/lib/api/auth";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { Field, OmInput } from "@/components/om/primitives/Field";

const PENDING_MSG =
  "Your account is awaiting approval from the platform administrator.";

function LoginInner() {
  const router = useRouter();
  const justSignedUp = useSearchParams().get("pending") === "1";
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(justSignedUp ? PENDING_MSG : "");
  const [form, setForm] = useState({ email: "", password: "", remember_me: false });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await auth.login(form);
      localStorage.setItem("access_token", res.token.access_token);
      localStorage.setItem("refresh_token", res.token.refresh_token);
      localStorage.setItem("user", JSON.stringify(res.user));
      document.cookie = `access_token=${res.token.access_token}; path=/; max-age=604800`;
      document.cookie = `refresh_token=${res.token.refresh_token}; path=/; max-age=2592000`;
      toast.success("Welcome back");
      router.push("/dashboard");
    } catch (err) {
      setError((err as Error).message || "Login failed. Check your credentials.");
      setLoading(false);
    }
  };

  // A correct password on an unapproved / suspended account isn't a login
  // failure — show it as a calm status message, not a red error.
  const isPending = /awaiting approval|suspended/i.test(error);

  return (
    <AuthLayout
      title="Log in to Tolkyn"
      subtitle="Pick up where your team left off."
      footer={
        <>
          New to Tolkyn?{" "}
          <Link href="/signup" className="font-semibold text-om-blue hover:underline">
            Create an account
          </Link>
          <span className="mt-2 block text-[11px] text-om-faint">
            By continuing you agree to our{" "}
            <Link href="/terms" className="hover:text-om-muted hover:underline">
              Terms
            </Link>{" "}
            and{" "}
            <Link href="/privacy" className="hover:text-om-muted hover:underline">
              Privacy Policy
            </Link>
            .
          </span>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-1">
        {error && (
          isPending ? (
            <div className="mb-3 flex items-start gap-2 rounded-lg border border-om-amber/25 bg-om-amber/10 px-3 py-2.5 text-[12px] text-om-amber">
              <Clock className="mt-px size-4 shrink-0" />
              <div>
                <p className="font-semibold">Almost there</p>
                <p className="mt-0.5 text-om-amber/90">{error} We&apos;ll email you as soon as it&apos;s active.</p>
              </div>
            </div>
          ) : (
            <div className="mb-3 flex items-center gap-2 rounded-lg border border-om-red/25 bg-om-red/10 px-3 py-2 text-[12px] text-om-red">
              <CircleAlert className="size-4 shrink-0" />
              {error}
            </div>
          )
        )}

        <Field label="Work email">
          <OmInput
            type="email"
            required
            autoComplete="email"
            placeholder="you@company.com"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
        </Field>

        <Field label="Password">
          <div className="relative">
            <OmInput
              type={showPassword ? "text" : "password"}
              required
              autoComplete="current-password"
              placeholder="••••••••"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPassword((s) => !s)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-om-muted hover:text-om-text"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
        </Field>

        <div className="mb-3 flex items-center justify-between">
          <label className="flex cursor-pointer items-center gap-2 text-[12px] text-om-muted">
            <input
              type="checkbox"
              checked={form.remember_me}
              onChange={(e) => setForm({ ...form, remember_me: e.target.checked })}
              className="size-3.5 rounded border-om-border bg-white/[0.04] accent-om-blue"
            />
            Remember me
          </label>
          <Link href="/forgot-password" className="text-[12px] font-medium text-om-blue hover:underline">
            Forgot password?
          </Link>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-om-blue text-[13px] font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,.18)] transition-colors hover:bg-[#5c85ff] disabled:opacity-60"
        >
          {loading ? (
            <>
              <Loader2 className="size-4 animate-spin" /> Signing in…
            </>
          ) : (
            <>
              Log in <ArrowRight className="size-4" />
            </>
          )}
        </button>
      </form>
    </AuthLayout>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginInner />
    </Suspense>
  );
}
