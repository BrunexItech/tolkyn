"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
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

function ResetPasswordInner() {
  const router = useRouter();
  const token = useSearchParams().get("token") ?? "";
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");

  const passOk = RULES.every((r) => r.test(pw));
  const matchOk = pw.length > 0 && pw === confirm;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!token) return setError("This link is missing its token. Request a new reset email.");
    if (!passOk) return setError("Password does not meet the requirements.");
    if (!matchOk) return setError("Passwords do not match.");
    setLoading(true);
    try {
      await auth.resetPassword(token, pw);
      toast.success("Password updated — sign in with your new password");
      router.push("/login");
    } catch (err) {
      setError((err as Error).message || "Could not reset your password.");
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Choose a new password"
      subtitle="Almost done — pick something you'll remember."
      footer={
        <Link href="/login" className="font-semibold text-om-blue hover:underline">
          Back to log in
        </Link>
      }
    >
      <form onSubmit={submit} className="space-y-1">
        {error && (
          <div className="mb-3 flex items-center gap-2 rounded-lg border border-om-red/25 bg-om-red/10 px-3 py-2 text-[12px] text-om-red">
            <CircleAlert className="size-4 shrink-0" />
            {error}
          </div>
        )}

        <Field label="New password">
          <div className="relative">
            <OmInput
              type={show ? "text" : "password"}
              required
              autoComplete="new-password"
              placeholder="••••••••"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              className="pr-10"
            />
            <button
              type="button"
              onClick={() => setShow((s) => !s)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-om-muted hover:text-om-text"
              aria-label={show ? "Hide password" : "Show password"}
            >
              {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
        </Field>

        <div className="mb-2 grid grid-cols-2 gap-1">
          {RULES.map((r) => {
            const ok = r.test(pw);
            return (
              <span
                key={r.key}
                className={cn(
                  "flex items-center gap-1 text-[11px]",
                  ok ? "text-om-green" : "text-om-faint",
                )}
              >
                <Check className="size-3" /> {r.label}
              </span>
            );
          })}
        </div>

        <Field label="Confirm new password">
          <OmInput
            type={show ? "text" : "password"}
            required
            autoComplete="new-password"
            placeholder="••••••••"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </Field>

        <button
          type="submit"
          disabled={loading || !passOk || !matchOk}
          className="mt-2 flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-om-blue text-[13px] font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,.18)] transition-colors hover:bg-[#5c85ff] disabled:opacity-60"
        >
          {loading ? (
            <>
              <Loader2 className="size-4 animate-spin" /> Updating…
            </>
          ) : (
            <>
              Update password <ArrowRight className="size-4" />
            </>
          )}
        </button>
      </form>
    </AuthLayout>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordInner />
    </Suspense>
  );
}
