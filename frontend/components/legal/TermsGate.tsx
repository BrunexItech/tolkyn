"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, ScrollText, ExternalLink } from "lucide-react";
import { accountApi, type Me } from "@/lib/api/account";
import { auth } from "@/lib/api/auth";
import { clearSession } from "@/lib/session";
import { BrandLoader } from "@/components/om/shell/BrandLoader";
import { LEGAL_EFFECTIVE } from "./version";
import { toast } from "@/lib/om/toast";

/** Hard gate: an approved user cannot reach the dashboard until they have
 * accepted the current Terms of Service and Privacy Policy. Acceptance is
 * recorded server-side (timestamp + version + IP) via POST /auth/accept-terms. */
export function TermsGate({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const router = useRouter();
  const [checked, setChecked] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["me"],
    queryFn: accountApi.me,
    retry: false,
    staleTime: 60_000,
  });

  const accept = useMutation({
    mutationFn: accountApi.acceptTerms,
    onSuccess: (me: Me) => {
      qc.setQueryData(["me"], me);
    },
    onError: (e: Error) => toast.err(e.message || "Could not record your acceptance"),
  });

  // Fail open: if /auth/me can't be read (network, or a 403 that other guards
  // handle), don't trap the user behind the terms screen.
  if (isError) return <>{children}</>;
  if (isLoading) return <BrandLoader />;
  if (data?.terms_accepted) return <>{children}</>;

  const logout = () => {
    auth.logout().catch(() => {});
    clearSession();
    router.push("/");
  };

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center overflow-y-auto bg-om-bg/95 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border border-om-border-strong bg-om-bg2 shadow-2xl">
        <div className="flex items-center gap-2.5 border-b border-om-border px-5 py-3.5">
          <span className="grid size-8 place-items-center rounded-lg bg-om-blue/12 text-om-blue">
            <ScrollText className="size-4" />
          </span>
          <div>
            <div className="text-[14px] font-semibold tracking-tight">Before you continue</div>
            <div className="text-[11px] text-om-muted">Terms of Service &amp; Privacy Policy · effective {LEGAL_EFFECTIVE}</div>
          </div>
        </div>

        <div className="space-y-3 px-5 py-4 text-[12.5px] leading-relaxed text-om-dim">
          <p>
            To use Tolkyn you need to agree to our Terms of Service and Privacy Policy. In short:
          </p>
          <ul className="space-y-1.5 pl-4 text-[12px] text-om-muted [&_li]:list-disc">
            <li>You&rsquo;re responsible for the content you publish and the messages you send, and for having consent from the people you message.</li>
            <li>
              Connecting WhatsApp for automation uses an <strong className="text-om-dim">unofficial integration</strong> — WhatsApp may restrict or ban a connected number. Use a dedicated number, not your primary one.
            </li>
            <li>We process your account data, messages, contacts and content only to run the platform; we don&rsquo;t sell your data or train our own models on your messages.</li>
            <li>The platform is provided &ldquo;as is&rdquo;, with no guarantee of message delivery or third-party account continuity, and limited liability.</li>
          </ul>
          <p className="text-[11.5px] text-om-faint">
            This summary doesn&rsquo;t replace the full documents. Please read them:
          </p>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/terms"
              target="_blank"
              className="inline-flex items-center gap-1.5 rounded-lg border border-om-border bg-white/[0.03] px-2.5 py-1.5 text-[11.5px] font-medium text-om-dim hover:border-om-blue/50 hover:text-om-text"
            >
              Terms of Service <ExternalLink className="size-3" />
            </Link>
            <Link
              href="/privacy"
              target="_blank"
              className="inline-flex items-center gap-1.5 rounded-lg border border-om-border bg-white/[0.03] px-2.5 py-1.5 text-[11.5px] font-medium text-om-dim hover:border-om-blue/50 hover:text-om-text"
            >
              Privacy Policy <ExternalLink className="size-3" />
            </Link>
          </div>

          <label className="mt-1 flex cursor-pointer items-start gap-2.5 rounded-lg border border-om-border bg-white/[0.02] px-3 py-2.5 text-[12px] text-om-dim">
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
              className="mt-0.5 size-4 shrink-0 rounded border-om-border bg-white/[0.04] accent-om-blue"
            />
            I have read and agree to the Terms of Service and Privacy Policy, and I consent to Tolkyn
            processing messages and data on my behalf as described in them.
          </label>
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-om-border px-5 py-3">
          <button onClick={logout} className="text-[12px] text-om-muted hover:text-om-text">
            Log out
          </button>
          <button
            onClick={() => accept.mutate()}
            disabled={!checked || accept.isPending}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-om-blue px-3.5 text-[12.5px] font-semibold text-white transition-colors hover:bg-[#5c85ff] disabled:opacity-50"
          >
            {accept.isPending ? <Loader2 className="size-3.5 animate-spin" /> : null}
            Agree &amp; continue
          </button>
        </div>
      </div>
    </div>
  );
}
