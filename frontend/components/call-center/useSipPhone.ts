"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SoftphoneConfig } from "@/lib/api/callcenter";
import { SipPhone, type SipState } from "./sip";
import { Ringtone } from "./ringtone";
import { toast } from "@/lib/om/toast";

/**
 * Registers a browser SIP endpoint when the workspace has a live trunk and the
 * current agent has a line assigned. When `cfg.configured` is false this is an
 * inert no-op and the Call Center runs entirely on the backend's simulated
 * provider.
 *
 * Lifecycle is reported out via `onEvent` so the Call Center store can keep the
 * backend Call row in sync (timer starts on answer, card clears on hangup, an
 * inbound INVITE raises a ringing card). Inbound calls are NOT auto-answered —
 * the agent accepts or declines from the UI.
 */
export type SipLifecycle =
  | { type: "inbound_ring"; from: string }
  | { type: "answered"; direction: "inbound" | "outbound"; from: string }
  | { type: "declined"; from: string }
  | { type: "ended" };

export function useSipPhone(
  cfg: SoftphoneConfig | null,
  onEvent?: (e: SipLifecycle) => void,
) {
  const [state, setState] = useState<SipState>("idle");
  const [incoming, setIncoming] = useState<string | null>(null);
  const incomingRef = useRef<string | null>(null);
  const phoneRef = useRef<SipPhone | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ringRef = useRef<Ringtone | null>(null);
  const onEventRef = useRef(onEvent);

  // keep the "latest value" refs current without touching them during render
  useEffect(() => {
    onEventRef.current = onEvent;
    incomingRef.current = incoming;
  });

  const enabled = !!cfg?.configured;

  useEffect(() => {
    if (!enabled || !cfg) return;
    if (typeof window === "undefined") return;

    const audio = document.createElement("audio");
    audio.autoplay = true;
    audio.setAttribute("data-sip", "remote");
    document.body.appendChild(audio);
    audioRef.current = audio;
    const ring = (ringRef.current ??= new Ringtone());

    const phone = new SipPhone(cfg, audio, {
      onState: setState,
      onInbound: (from) => {
        setIncoming(from);
        ring.start();
        onEventRef.current?.({ type: "inbound_ring", from });
      },
      onAnswered: (direction) => {
        ring.stop();
        onEventRef.current?.({
          type: "answered",
          direction,
          from: phone.inboundFrom,
        });
      },
      onEnded: () => {
        ring.stop();
        setIncoming(null);
        onEventRef.current?.({ type: "ended" });
      },
      onError: (m) => toast.err(`Softphone: ${m}`),
    });
    phoneRef.current = phone;
    phone.start().catch(() => undefined);

    return () => {
      ring.stop();
      phone.stop().catch(() => undefined);
      phoneRef.current = null;
      audio.remove();
      audioRef.current = null;
      setState("idle");
      setIncoming(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, cfg?.extension, cfg?.ws_url, cfg?.domain]);

  const dial = useCallback(async (target: string) => {
    await phoneRef.current?.call(target);
  }, []);
  const answer = useCallback(async () => {
    ringRef.current?.stop();
    setIncoming(null);
    await phoneRef.current?.answer();
  }, []);
  const decline = useCallback(async () => {
    const from = incomingRef.current ?? "";
    ringRef.current?.stop();
    setIncoming(null);
    await phoneRef.current?.decline();
    onEventRef.current?.({ type: "declined", from });
  }, []);
  const hangup = useCallback(async () => {
    await phoneRef.current?.hangup();
  }, []);
  const setMuted = useCallback(async (m: boolean) => {
    await phoneRef.current?.setMuted(m);
  }, []);
  const setHold = useCallback(async (h: boolean) => {
    await phoneRef.current?.setHold(h);
  }, []);

  return { enabled, state, incoming, dial, answer, decline, hangup, setMuted, setHold };
}
