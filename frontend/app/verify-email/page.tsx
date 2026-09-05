"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Loader2, CircleCheck, CircleAlert } from "lucide-react";
import { auth } from "@/lib/api/auth";
import { AuthLayout } from "@/components/auth/AuthLayout";

function VerifyEmailInner() {
  const token = useSearchParams().get("token") ?? "";
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");
  const [message, setMessage] = useState("");
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    if (!token) {
      setState("error");
      setMessage("This link is missing its token.");
      return;
    }
    auth
      .verifyEmail(token)
      .then((r) => {
        setState("ok");
        setMessage(r.message || "Your email is confirmed.");
      })
      .catch((e) => {
        setState("error");
        setMessage((e as Error).message || "We couldn't confirm this link.");
      });
  }, [token]);

  return (
    <AuthLayout
      title="Email confirmation"
      subtitle="Verifying your email address."
      footer={
        <Link href="/login" className="font-semibold text-om-blue hover:underline">
          Continue to log in
        </Link>
      }
    >
      <div className="flex flex-col items-center gap-3 rounded-xl border border-om-border bg-om-card/60 p-6 text-center">
        {state === "loading" && <Loader2 className="size-8 animate-spin text-om-muted" />}
        {state === "ok" && <CircleCheck className="size-8 text-om-green" />}
        {state === "error" && <CircleAlert className="size-8 text-om-red" />}
        <p className="text-[12.5px] leading-relaxed text-om-muted">
          {state === "loading" ? "One moment…" : message}
        </p>
      </div>
    </AuthLayout>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={null}>
      <VerifyEmailInner />
    </Suspense>
  );
}
