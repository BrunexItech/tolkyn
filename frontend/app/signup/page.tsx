"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, ArrowRight, Loader2, CircleAlert, Check } from "lucide-react";
import toast from "react-hot-toast";
import { auth } from "@/lib/api/auth";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { Field, OmInput } from "@/components/om/primitives/Field";
import { cn } from "@/lib/utils";

const RULES = [
  { key: "length", label: "8+ characters", test: (p: string) => p.length >= 8 },
  { key: "uppercase", label: "One uppercase", test: (p: string) => /[A-Z]/.test(p) },
  { key: "lowercase", label: "One lowercase", test: (p: string) => /[a-z]/.test(p) },
  { key: "number", label: "One number", test: (p: string) => /[0-9]/.test(p) },
];

export default function SignupPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ name: "", email: "", password: "", password_confirm: "" });
  const [agree, setAgree] = useState(false);

  const passOk = RULES.every((r) => r.test(form.password));
  const matchOk = form.password.length > 0 && form.password === form.password_confirm;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!passOk) return setError("Password does not meet the requirements.");
    if (!matchOk) return setError("Passwords do not match.");
    if (!agree) return setError("Please agree to the Terms of Service and Privacy Policy.");
    setLoading(true);
    try {
      await auth.register(form);
      toast.success("Account created — a platform admin will review it shortly");
      router.push("/login?pending=1");
    } catch (err) {
      setError((err as Error).message || "Registration failed. Please try again.");
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Create your workspace"
      subtitle="Free to start. No card required."
      footer={
        <>
          Already have an account?{" "}
          <Link href="/login" className="font-semibold text-om-blue hover:underline">
            Log in
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-1">
        {error && (
          <div className="mb-3 flex items-center gap-2 rounded-lg border border-om-red/25 bg-om-red/10 px-3 py-2 text-[12px] text-om-red">
            <CircleAlert className="size-4 shrink-0" />
            {error}
          </div>
        )}

        <Field label="Full name">
          <OmInput
            required
            autoComplete="name"
            placeholder="Alex Rivera"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </Field>

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
              autoComplete="new-password"
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
          <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
            {RULES.map((r) => {
              const ok = r.test(form.password);
              return (
                <span
                  key={r.key}
                  className={cn(
                    "flex items-center gap-1.5 text-[11px]",
                    ok ? "text-om-green" : "text-om-muted",
                  )}
                >
                  <Check className={cn("size-3", ok ? "opacity-100" : "opacity-30")} />
                  {r.label}
                </span>
              );
            })}
          </div>
        </Field>

        <Field label="Confirm password">
          <OmInput
            type={showPassword ? "text" : "password"}
            required
            autoComplete="new-password"
            placeholder="••••••••"
            value={form.password_confirm}
            onChange={(e) => setForm({ ...form, password_confirm: e.target.value })}
          />
          {form.password_confirm.length > 0 && (
            <div
              className={cn(
                "mt-1 text-[11px]",
                matchOk ? "text-om-green" : "text-om-red",
              )}
            >
              {matchOk ? "Passwords match" : "Passwords do not match"}
            </div>
          )}
        </Field>

        <label className="mt-2 flex cursor-pointer items-start gap-2 text-[11.5px] leading-relaxed text-om-muted">
          <input
            type="checkbox"
            checked={agree}
            onChange={(e) => setAgree(e.target.checked)}
            className="mt-0.5 size-3.5 shrink-0 rounded border-om-border bg-white/[0.04] accent-om-blue"
          />
          <span>
            I agree to the{" "}
            <Link href="/terms" target="_blank" className="font-semibold text-om-blue hover:underline">
              Terms of Service
            </Link>{" "}
            and{" "}
            <Link href="/privacy" target="_blank" className="font-semibold text-om-blue hover:underline">
              Privacy Policy
            </Link>
            .
          </span>
        </label>

        <button
          type="submit"
          disabled={loading || !agree}
          className="mt-2 flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-om-blue text-[13px] font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,.18)] transition-colors hover:bg-[#5c85ff] disabled:opacity-60"
        >
          {loading ? (
            <>
              <Loader2 className="size-4 animate-spin" /> Creating account…
            </>
          ) : (
            <>
              Create account <ArrowRight className="size-4" />
            </>
          )}
        </button>
      </form>
    </AuthLayout>
  );
}
