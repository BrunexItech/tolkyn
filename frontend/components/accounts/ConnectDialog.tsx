"use client";

import { ExternalLink, Loader2, ShieldCheck } from "lucide-react";
import { Modal } from "@/components/om/primitives/Modal";
import { OmButton } from "@/components/om/primitives/OmButton";
import { PlatformGlyph } from "@/components/om/primitives/PlatformChip";
import { platform as findPlatform } from "@/lib/om/platforms";
import { useConnect } from "./hooks";

export function ConnectDialog({
  platformId,
  onOpenChange,
}: {
  platformId: string | null;
  onOpenChange: (v: boolean) => void;
}) {
  const p = platformId ? findPlatform(platformId) : undefined;
  const connect = useConnect();

  return (
    <Modal
      open={!!platformId}
      onOpenChange={onOpenChange}
      title={p ? `Connect ${p.name}` : "Connect account"}
      description={`Opens a secure connect page — pick ${p?.name ?? "the platform"}, sign in and approve, then come back here.`}
      className="w-[min(94vw,420px)]"
      footer={
        <>
          <OmButton variant="ghost" size="sm" onClick={() => onOpenChange(false)} disabled={connect.isPending}>
            Cancel
          </OmButton>
          <OmButton
            variant="solid"
            size="sm"
            onClick={() => platformId && connect.mutate(platformId)}
            disabled={connect.isPending}
          >
            {connect.isPending ? <Loader2 className="animate-spin" /> : <ExternalLink />}
            Continue
          </OmButton>
        </>
      }
    >
      <div className="flex flex-col items-center py-1">
        {p && <PlatformGlyph platform={p} size={44} />}
        <div className="mt-2 text-[13px] font-semibold">{p?.name}</div>
        <div className="text-[11px] text-om-muted">Publish, listen and report</div>
      </div>

      <div className="mt-3 flex items-start gap-1.5 rounded-md border border-om-border bg-white/[0.02] px-2.5 py-2 text-[10.5px] text-om-muted">
        <ShieldCheck className="mt-px size-3.5 shrink-0 text-om-green" />
        On {p?.name}&apos;s screen you&apos;ll see our publishing partner (Upload-Post) named as the
        app — that&apos;s what lets you connect instantly without a developer review. Your password
        is never seen and access can be revoked any time.
      </div>
    </Modal>
  );
}
