"use client";

import { useEffect, useState } from "react";
import {
  Delete,
  Mic,
  MicOff,
  Pause,
  Play,
  Phone,
  PhoneOff,
  PhoneForwarded,
  PhoneOutgoing,
  PhoneIncoming,
  CircleDot,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardTitle } from "@/components/om/primitives/Card";
import type { CallOutcome } from "@/lib/api/callcenter";
import { useCallCenter } from "./store";
import { useSipPhone } from "./useSipPhone";
import { CallWaveform } from "./CallWaveform";
import { formatDuration } from "@/lib/om/call-center";
import { toast } from "@/lib/om/toast";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"] as const;
const SUBS: Record<string, string> = { "2": "ABC", "3": "DEF", "4": "GHI", "5": "JKL", "6": "MNO", "7": "PQRS", "8": "TUV", "9": "WXYZ" };

export function Softphone() {
  const { active, dial, softphone } = useCallCenter();
  const sip = useSipPhone(softphone);

  return (
    <div className="space-y-2">
      {active ? <ActiveCallCard sip={sip} /> : <DialerCard onDial={dial} sip={sip} />}
      <TrunkStatus softphone={softphone} sipState={sip.state} />
    </div>
  );
}

function TrunkStatus({
  softphone,
  sipState,
}: {
  softphone: ReturnType<typeof useCallCenter>["softphone"];
  sipState: string;
}) {
  if (!softphone) return null;

  if (!softphone.configured) {
    const reason =
      softphone.provider === "cloudone"
        ? "SIP trunk is live for this workspace — ask an admin to assign you an extension."
        : "Simulated mode — calls are demo only. An admin can connect a SIP trunk in Admin → Telephony.";
    return (
      <div className="flex items-center gap-1.5 rounded-lg border border-om-border bg-om-bg/50 px-2.5 py-1.5 text-[10.5px] text-om-muted">
        <CircleDot className="size-3 text-om-amber" /> {reason}
      </div>
    );
  }

  const ok = sipState === "registered" || sipState === "in-call" || sipState === "calling";
  return (
    <div className="flex items-center gap-1.5 rounded-lg border border-om-border bg-om-bg/50 px-2.5 py-1.5 text-[10.5px] text-om-muted">
      <CircleDot className={cn("size-3", ok ? "text-om-green" : "text-om-amber")} />
      Line {softphone.extension} ·{" "}
      {sipState === "connecting"
        ? "connecting to trunk…"
        : ok
          ? "trunk connected"
          : sipState === "failed"
            ? "trunk connection failed"
            : sipState}
    </div>
  );
}

function DialerCard({
  onDial,
  sip,
}: {
  onDial: (name: string, number: string) => void;
  sip: ReturnType<typeof useSipPhone>;
}) {
  const [number, setNumber] = useState("");

  const press = (k: string) => setNumber((n) => (n.length < 20 ? n + k : n));

  return (
    <Card accent="blue">
      <CardTitle icon={<PhoneOutgoing />}>Dialer</CardTitle>

      <div className="mb-3 flex h-11 items-center justify-between rounded-lg border border-om-border bg-om-bg/60 px-3">
        <input
          value={number}
          onChange={(e) => setNumber(e.target.value.replace(/[^\d+*#() -]/g, ""))}
          placeholder="Enter a number"
          className="w-full bg-transparent font-mono text-[15px] tracking-wide text-om-text outline-none placeholder:text-om-muted"
        />
        {number && (
          <button
            onClick={() => setNumber((n) => n.slice(0, -1))}
            className="ml-2 shrink-0 text-om-muted hover:text-om-text"
            aria-label="Delete"
          >
            <Delete className="size-4" />
          </button>
        )}
      </div>

      <div className="mx-auto grid max-w-[236px] grid-cols-3 gap-2">
        {KEYS.map((k) => (
          <button
            key={k}
            onClick={() => press(k)}
            className="flex h-12 flex-col items-center justify-center rounded-xl border border-om-border bg-white/[0.02] transition-colors hover:border-om-blue/50 hover:bg-om-blue/10 active:translate-y-px"
          >
            <span className="font-mono text-[16px] font-semibold leading-none text-om-text">{k}</span>
            {SUBS[k] && (
              <span className="mt-0.5 text-[8px] font-medium tracking-[0.12em] text-om-muted">
                {SUBS[k]}
              </span>
            )}
          </button>
        ))}
      </div>

      <button
        disabled={!number.trim()}
        onClick={() => {
          const n = number.trim();
          onDial("Unknown", n);
          if (sip.enabled) sip.dial(n).catch(() => undefined);
          setNumber("");
        }}
        className="mx-auto mt-3 flex h-11 w-full max-w-[236px] items-center justify-center gap-2 rounded-xl bg-om-green font-semibold text-black shadow-[inset_0_1px_0_rgba(255,255,255,.2)] transition-colors hover:brightness-105 disabled:opacity-40"
      >
        <Phone className="size-4" /> Call
      </button>
    </Card>
  );
}

function ActiveCallCard({ sip }: { sip: ReturnType<typeof useSipPhone> }) {
  const { active, hangup, toggleMute, toggleHold } = useCallCenter();
  const [elapsed, setElapsed] = useState(0);

  const wrapMute = () => {
    if (active && sip.enabled) sip.setMuted(!active.muted).catch(() => undefined);
    toggleMute();
  };
  const wrapHold = () => {
    if (active && sip.enabled) sip.setHold(!active.onHold).catch(() => undefined);
    toggleHold();
  };
  const wrapHangup = (outcome: CallOutcome) => {
    if (sip.enabled) sip.hangup().catch(() => undefined);
    hangup(outcome);
  };

  useEffect(() => {
    if (!active) return;
    const startedMs = new Date(active.startedAt).getTime();
    const tick = () => setElapsed(Math.max(0, Math.round((Date.now() - startedMs) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [active]);

  if (!active) return null;
  const Dir = active.direction === "inbound" ? PhoneIncoming : PhoneOutgoing;

  return (
    <Card accent="green">
      <CardTitle
        icon={<Dir />}
        action={
          <span className="flex items-center gap-1 text-[10px] font-semibold text-om-red">
            <CircleDot className="size-3 om-live-dot" /> REC
          </span>
        }
      >
        {active.onHold ? "On hold" : "In call"}
      </CardTitle>

      <div className="flex flex-col items-center py-2">
        <span className="grid size-14 place-items-center rounded-full bg-gradient-to-br from-om-blue to-om-violet text-[16px] font-bold text-white">
          {active.name
            .split(" ")
            .map((p) => p[0])
            .join("")
            .slice(0, 2)
            .toUpperCase()}
        </span>
        <div className="mt-2 text-[14px] font-semibold">{active.name}</div>
        <div className="font-mono text-[11.5px] text-om-muted">{active.number}</div>
        <div className="mt-1 font-mono text-[20px] font-bold tracking-wide text-om-green">
          {formatDuration(elapsed)}
        </div>
      </div>

      <div className="my-2">
        <CallWaveform paused={active.onHold} />
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <ControlButton
          active={active.muted}
          onClick={wrapMute}
          icon={active.muted ? <MicOff /> : <Mic />}
          label={active.muted ? "Unmute" : "Mute"}
        />
        <ControlButton
          active={active.onHold}
          onClick={wrapHold}
          icon={active.onHold ? <Play /> : <Pause />}
          label={active.onHold ? "Resume" : "Hold"}
        />
        <ControlButton
          onClick={() => {
            toast.info("Transfer — pick a teammate");
            wrapHangup("transferred");
          }}
          icon={<PhoneForwarded />}
          label="Transfer"
        />
      </div>

      <button
        onClick={() => wrapHangup("completed")}
        className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-om-red font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,.18)] transition-colors hover:brightness-110"
      >
        <PhoneOff className="size-4" /> Hang up
      </button>
    </Card>
  );
}

function ControlButton({
  icon,
  label,
  onClick,
  active,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex flex-col items-center gap-1 rounded-xl border py-2 text-[10px] font-medium transition-colors [&_svg]:size-4",
        active
          ? "border-om-blue/50 bg-om-blue/15 text-om-blue"
          : "border-om-border bg-white/[0.02] text-om-dim hover:border-om-blue/40 hover:text-om-text",
      )}
    >
      {icon}
      {label}
    </button>
  );
}
