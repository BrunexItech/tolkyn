"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, ArrowLeft, Loader2, CircleAlert, MailCheck } from "lucide-react";
import { auth } from "@/lib/api/auth";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { Field, OmInput } from "@/components/om/primitives/Field";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await auth.forgotPassword(email.trim());
      setSent(true);
    } catch (err) {
      setError((err as Error).message || "Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Reset your password"
      subtitle="We'll email you a link to set a new one."
      footer={
        <Link href="/login" className="inline-flex items-center gap-1 font-semibold text-om-blue hover:underline">
          <ArrowLeft className="size-3.5" /> Back to log in
        </Link>
      }
    >
      {sent ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-om-border bg-om-card/60 p-6 text-center">
          <MailCheck className="size-8 text-om-green" />
          <div className="text-[13px] font-semibold">Check your inbox</div>
          <p className="text-[12px] leading-relaxed text-om-muted">
            If an account exists for <span className="text-om-text">{email}</span>, a password-reset
            link is on its way. It expires in 1 hour.
          </p>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-1">
          {error && (
            <div className="mb-3 flex items-center gap-2 rounded-lg border border-om-red/25 bg-om-red/10 px-3 py-2 text-[12px] text-om-red">
              <CircleAlert className="size-4 shrink-0" />
              {error}
            </div>
          )}
          <Field label="Work email">
            <OmInput
              type="email"
              required
              autoComplete="email"
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          <button
            type="submit"
            disabled={loading || !email.trim()}
            className="mt-2 flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-om-blue text-[13px] font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,.18)] transition-colors hover:bg-[#5c85ff] disabled:opacity-60"
          >
            {loading ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Sending…
              </>
            ) : (
              <>
                Send reset link <ArrowRight className="size-4" />
              </>
            )}
          </button>
        </form>
      )}
    </AuthLayout>
  );
}
