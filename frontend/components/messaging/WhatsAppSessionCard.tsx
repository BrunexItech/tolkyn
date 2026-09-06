"use client";

import { useState } from "react";
import Image from "next/image";
import { CircleCheck, Loader2, ShieldAlert, Smartphone, Unplug } from "lucide-react";
import { FaWhatsapp } from "react-icons/fa6";
import { Card, CardTitle } from "@/components/om/primitives/Card";
import { OmButton } from "@/components/om/primitives/OmButton";
import {
  useConnectWhatsAppWeb,
  useDisconnectWhatsAppWeb,
  useWhatsAppWebStatus,
} from "./hooks";

const WA_GREEN = "#25D366";

/** Real, automated WhatsApp — a self-hosted session (not the official Cloud
 * API) that lets messages flow into the Inbox/CRM like every other channel.
 * This is deliberately labeled "Beta" everywhere it appears: it's unofficial
 * automation, and the connected number carries a real (if isolated,
 * per-number) risk of being restricted by WhatsApp. */
function Spinner({ label, sub }: { label: string; sub?: string }) {
  return (
    <div className="flex flex-col items-center gap-2.5 py-8 text-center">
      <div className="relative flex size-12 items-center justify-center">
        <span
          className="absolute inline-flex size-9 animate-ping rounded-full opacity-20"
          style={{ background: WA_GREEN }}
        />
        <Loader2 className="size-7 animate-spin" style={{ color: WA_GREEN }} />
      </div>
      <div className="text-[12.5px] font-medium text-om-dim">{label}</div>
      {sub && <div className="max-w-[15rem] text-[10.5px] leading-relaxed text-om-faint">{sub}</div>}
    </div>
  );
}

export function WhatsAppSessionCard() {
  const { data, isLoading } = useWhatsAppWebStatus();
  const connect = useConnectWhatsAppWeb();
  const disconnect = useDisconnectWhatsAppWeb();
  const [acknowledged, setAcknowledged] = useState(false);

  const status = data?.status ?? "disconnected";
  // Any moment where a connection is being established but there's nothing
  // actionable to show yet: initial status load, the connect request in
  // flight, the worker booting the session, or "qr" reported a beat before
  // the QR image itself arrives. All of them get a real spinner, never a
  // blank card or a flash of the "acknowledge & connect" screen.
  const isEstablishing =
    isLoading ||
    connect.isPending ||
    status === "connecting" ||
    (status === "qr" && !data?.qr);

  // The QR has been scanned and WhatsApp is pairing the device + pushing
  // history. Can take up to a minute — never show a stale QR or the connect
  // screen here, always the "linking" spinner.
  const isLinking = status === "linking";

  return (
    <Card accent="green" className="space-y-3">
      <CardTitle icon={<FaWhatsapp style={{ color: WA_GREEN }} />} color={WA_GREEN}>
        WhatsApp — automated (Beta)
      </CardTitle>

      {isLoading ? (
        <Spinner label="Checking WhatsApp status…" />
      ) : isLinking ? (
        <Spinner
          label="Linking your account…"
          sub="QR scanned. Pairing the device and syncing your recent chats — this can take up to a minute, no need to touch your phone."
        />
      ) : status === "connected" ? (
        <>
          <div className="flex items-center gap-2 rounded-lg border border-om-green/25 bg-om-green/[0.06] px-3 py-2.5">
            <CircleCheck className="size-4 shrink-0 text-om-green" />
            <div className="min-w-0 flex-1">
              <div className="text-[12.5px] font-medium text-om-text">Connected</div>
              <div className="truncate text-[11px] text-om-muted">{data?.phone}</div>
            </div>
          </div>
          <p className="text-[11px] leading-relaxed text-om-faint">
            Messages sent to this number now flow into your Inbox and get scanned for leads
            automatically, same as your other channels.
          </p>
          <OmButton
            variant="ghost"
            size="sm"
            onClick={() => disconnect.mutate()}
            disabled={disconnect.isPending}
          >
            {disconnect.isPending ? <Loader2 className="animate-spin" /> : <Unplug className="size-3.5" />}
            Disconnect
          </OmButton>
        </>
      ) : status === "qr" && data?.qr ? (
        <div className="flex flex-col items-center gap-2.5 py-1">
          <div className="rounded-xl border border-om-border bg-white p-2">
            <Image src={data.qr} alt="WhatsApp QR code" width={200} height={200} unoptimized />
          </div>
          <div className="flex items-center gap-1.5 text-[11.5px] text-om-dim">
            <Smartphone className="size-3.5" />
            Open WhatsApp on the phone you want to connect → Linked devices → scan this
          </div>
        </div>
      ) : isEstablishing ? (
        <Spinner
          label="Connecting to WhatsApp…"
          sub="Setting up the session — the QR code will appear here in a few seconds."
        />
      ) : (
        <>
          <div className="flex items-start gap-2 rounded-lg border border-om-amber/25 bg-om-amber/[0.07] px-2.5 py-2">
            <ShieldAlert className="mt-0.5 size-3.5 shrink-0 text-om-amber" />
            <p className="text-[10.5px] leading-relaxed text-om-amber">
              Use a dedicated number, not your primary one. See the{" "}
              <a href="/terms" target="_blank" rel="noreferrer" className="font-semibold underline">
                Terms of Service
              </a>{" "}
              for how the WhatsApp integration works.
            </p>
          </div>
          <label className="flex cursor-pointer items-start gap-2 text-[11px] leading-relaxed text-om-dim">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(e) => setAcknowledged(e.target.checked)}
              className="mt-0.5 size-3.5 shrink-0 rounded border-om-border bg-white/[0.04] accent-om-green"
            />
            I consent to Tolkyn connecting this WhatsApp number for automated messaging — sending,
            receiving and processing messages on my behalf.
          </label>
          <OmButton
            variant="solid"
            size="md"
            disabled={!acknowledged || connect.isPending}
            onClick={() => connect.mutate()}
            style={acknowledged ? { background: WA_GREEN, color: "#04140c" } : undefined}
          >
            {connect.isPending && <Loader2 className="animate-spin" />} Connect a number
          </OmButton>
        </>
      )}
    </Card>
  );
}
