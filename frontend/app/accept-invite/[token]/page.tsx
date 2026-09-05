"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff, ArrowRight, Loader2, CircleAlert } from "lucide-react";
import toast from "react-hot-toast";
import { teamApi, type InvitePreview } from "@/lib/api/team";
import { ApiError } from "@/lib/api/http";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { Field, OmInput } from "@/components/om/primitives/Field";

export default function AcceptInvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const router = useRouter();

  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [previewError, setPreviewError] = useState("");
  const [loadingPreview, setLoadingPreview] = useState(true);

  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    teamApi
      .previewInvite(token)
      .then((p) => setPreview(p))
      .catch((e: unknown) =>
        setPreviewError(e instanceof ApiError ? e.message : "This invite link isn't valid."),
      )
      .finally(() => setLoadingPreview(false));
  }, [token]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (password !== passwordConfirm) {
      setError("Passwords do not match");
      return;
    }
    setSubmitting(true);
    try {
      const res = await teamApi.acceptInvite(token, {
        name: name.trim() || undefined,
        password,
        password_confirm: passwordConfirm,
      });
      localStorage.setItem("access_token", res.token.access_token);
      localStorage.setItem("refresh_token", res.token.refresh_token);
      localStorage.setItem("user", JSON.stringify(res.user));
      document.cookie = `access_token=${res.token.access_token}; path=/; max-age=604800`;
      document.cookie = `refresh_token=${res.token.refresh_token}; path=/; max-age=2592000`;
      toast.success(`Welcome to ${preview?.workspace_name ?? "the workspace"}`);
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't accept this invite.");
      setSubmitting(false);
    }
  };

  if (loadingPreview) {
    return (
      <AuthLayout title="Loading invite…" subtitle=" " footer={null}>
        <Loader2 className="size-5 animate-spin text-om-muted" />
      </AuthLayout>
    );
  }

  if (previewError || !preview) {
    return (
      <AuthLayout
        title="This invite isn't valid"
        subtitle={previewError || "It may have expired or already been used."}
        footer={
          <Link href="/login" className="font-semibold text-om-blue hover:underline">
            Go to login
          </Link>
        }
      >
        <div className="flex items-center gap-2 rounded-lg border border-om-red/25 bg-om-red/10 px-3 py-2 text-[12px] text-om-red">
          <CircleAlert className="size-4 shrink-0" />
          Ask whoever invited you to send a new invite.
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title={`Join ${preview.workspace_name}`}
      subtitle={`${preview.inviter_name ?? "Someone"} invited you as ${preview.role}. Set a password to get in.`}
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

        <Field label="Email">
          <OmInput value={preview.email} disabled />
        </Field>

        <Field label="Your name">
          <OmInput
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Optional"
          />
        </Field>

        <Field label="Password">
          <div className="relative">
            <OmInput
              type={showPassword ? "text" : "password"}
              required
              minLength={8}
              autoComplete="new-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
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

        <Field label="Confirm password">
          <OmInput
            type={showPassword ? "text" : "password"}
            required
            minLength={8}
            autoComplete="new-password"
            placeholder="••••••••"
            value={passwordConfirm}
            onChange={(e) => setPasswordConfirm(e.target.value)}
          />
        </Field>

        <button
          type="submit"
          disabled={submitting}
          className="mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-om-blue text-[13px] font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,.18)] transition-colors hover:bg-[#5c85ff] disabled:opacity-60"
        >
          {submitting ? (
            <>
              <Loader2 className="size-4 animate-spin" /> Joining…
            </>
          ) : (
            <>
              Accept invite <ArrowRight className="size-4" />
            </>
          )}
        </button>
      </form>
    </AuthLayout>
  );
}
