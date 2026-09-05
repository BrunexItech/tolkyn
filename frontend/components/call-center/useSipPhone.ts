"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SoftphoneConfig } from "@/lib/api/callcenter";
import { SipPhone, type SipState } from "./sip";
import { toast } from "@/lib/om/toast";

/**
 * Registers a browser SIP endpoint when the workspace has a live trunk and the
 * current agent has a line assigned. When `cfg.configured` is false this is an
 * inert no-op and the Call Center runs entirely on the backend's simulated
 * provider.
 *
 * The PBX click-to-dial model: POST /call-center/dial makes the PBX ring this
 * registered extension; we auto-answer that leg so the agent hears audio. Manual
 * outbound straight from the softphone uses `dial()`.
 */
export function useSipPhone(cfg: SoftphoneConfig | null) {
  const [state, setState] = useState<SipState>("idle");
  const [inbound, setInbound] = useState<string | null>(null);
  const phoneRef = useRef<SipPhone | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const enabled = !!cfg?.configured;

  useEffect(() => {
    if (!enabled || !cfg) return;
    if (typeof window === "undefined") return;

    const audio = document.createElement("audio");
    audio.autoplay = true;
    audio.setAttribute("data-sip", "remote");
    document.body.appendChild(audio);
    audioRef.current = audio;

    const phone = new SipPhone(cfg, audio, {
      onState: setState,
      onInbound: (from) => {
        setInbound(from);
        // Auto-answer the PBX-originated leg for click-to-dial.
        phone.answer().catch(() => undefined);
      },
      onEnded: () => setInbound(null),
      onError: (m) => toast.err(`Softphone: ${m}`),
    });
    phoneRef.current = phone;
    phone.start().catch(() => undefined);

    return () => {
      phone.stop().catch(() => undefined);
      phoneRef.current = null;
      audio.remove();
      audioRef.current = null;
      setState("idle");
      setInbound(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, cfg?.extension, cfg?.ws_url, cfg?.domain]);

  const dial = useCallback(async (target: string) => {
    await phoneRef.current?.call(target);
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

  return { enabled, state, inbound, dial, hangup, setMuted, setHold };
}
