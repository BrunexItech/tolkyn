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
  UserPlus,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardTitle } from "@/components/om/primitives/Card";
import type { CallOutcome } from "@/lib/api/callcenter";
import { useCallCenter } from "./store";
import type { useSipPhone } from "./useSipPhone";
import { CallWaveform } from "./CallWaveform";
import { formatDuration } from "@/lib/om/call-center";
import { toast } from "@/lib/om/toast";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"] as const;
const SUBS: Record<string, string> = { "2": "ABC", "3": "DEF", "4": "GHI", "5": "JKL", "6": "MNO", "7": "PQRS", "8": "TUV", "9": "WXYZ" };

export function Softphone() {
  const { active, dial, softphone, sip } = useCallCenter();

  return (
    <div className="space-y-2">
      {sip.incoming && !active ? (
        <IncomingCallCard
          from={sip.incoming}
          onAnswer={() => sip.answer().catch(() => undefined)}
          onDecline={() => sip.decline().catch(() => undefined)}
        />
      ) : active ? (
        <ActiveCallCard sip={sip} />
      ) : (
        <DialerCard onDial={dial} />
      )}
      <TrunkStatus softphone={softphone} sipState={sip.state} />
    </div>
  );
}

function IncomingCallCard({
  from,
  onAnswer,
  onDecline,
}: {
  from: string;
  onAnswer: () => void;
  onDecline: () => void;
}) {
  // No countdown/elapsed indicator existed here at all before -- just a
  // static "ringing…" label. Ticks from when this card first mounted
  // (the moment the inbound INVITE arrived), same interval pattern as the
  // answered-call timer below.
  const [ringingSec, setRingingSec] = useState(0);
  useEffect(() => {
    setRingingSec(0);
    const id = setInterval(() => setRingingSec((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [from]);

  return (
    <Card accent="amber">
      <CardTitle icon={<PhoneIncoming />}>Incoming call</CardTitle>

      <div className="flex flex-col items-center py-3">
        <span className="grid size-14 place-items-center rounded-full bg-om-amber/15 text-om-amber">
          <PhoneIncoming className="size-6" />
        </span>
        <div className="mt-2 font-mono text-[14px] font-semibold text-om-text">
          {from || "Unknown caller"}
        </div>
        <div className="mt-0.5 flex items-center gap-1 text-[11px] text-om-muted">
          <CircleDot className="size-3 om-live-dot text-om-amber" /> ringing… {formatDuration(ringingSec)}
        </div>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2">
        <button
          onClick={onDecline}
          className="flex h-11 items-center justify-center gap-2 rounded-xl bg-om-red font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,.18)] transition-colors hover:brightness-110"
        >
          <PhoneOff className="size-4" /> Decline
        </button>
        <button
          onClick={onAnswer}
          className="flex h-11 items-center justify-center gap-2 rounded-xl bg-om-green font-semibold text-black shadow-[inset_0_1px_0_rgba(255,255,255,.2)] transition-colors hover:brightness-105"
        >
          <Phone className="size-4" /> Answer
        </button>
      </div>
    </Card>
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
      softphone.provider !== "simulated"
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
}: {
  onDial: (name: string, number: string) => void;
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
  const { active, hangup, toggleMute, toggleHold, saveCallerName } = useCallCenter();
  const [elapsed, setElapsed] = useState(0);
  const [namingCaller, setNamingCaller] = useState(false);
  const [callerNameInput, setCallerNameInput] = useState("");
  const ringing = !!active?.ringing;

  useEffect(() => {
    setNamingCaller(false);
    setCallerNameInput("");
  }, [active?.id]);

  const submitCallerName = () => {
    const name = callerNameInput.trim();
    if (!active || !name) return;
    saveCallerName(active.id, name);
    setNamingCaller(false);
  };

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
    if (!active || ringing) return;
    const startedMs = new Date(active.startedAt).getTime();
    const tick = () => setElapsed(Math.max(0, Math.round((Date.now() - startedMs) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [active, ringing]);

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

        {active.name === "Unknown caller" &&
          (namingCaller ? (
            <div className="mt-1.5 flex items-center gap-1">
              <input
                autoFocus
                value={callerNameInput}
                onChange={(e) => setCallerNameInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") submitCallerName();
                  if (e.key === "Escape") setNamingCaller(false);
                }}
                placeholder="Who's calling?"
                maxLength={160}
                className="w-36 rounded-md border border-om-border bg-white/[0.04] px-2 py-1 text-[11.5px] text-om-text outline-none focus:border-om-blue/60"
              />
              <button
                type="button"
                onClick={submitCallerName}
                className="grid size-6 shrink-0 place-items-center rounded-md border border-om-border text-om-green hover:border-om-green/40"
              >
                <Check className="size-3" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setNamingCaller(true)}
              className="mt-1 inline-flex items-center gap-1 text-[10.5px] font-medium text-om-blue hover:underline"
            >
              <UserPlus className="size-3" /> Save name
            </button>
          ))}

        <div className="mt-1 font-mono text-[20px] font-bold tracking-wide text-om-green">
          {ringing
            ? active.direction === "inbound"
              ? "Connecting…"
              : "Calling…"
            : formatDuration(elapsed)}
        </div>
      </div>

      <div className="my-2">
        <CallWaveform paused={active.onHold || ringing} />
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
