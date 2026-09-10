"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  callCenterApi,
  type ActiveCall,
  type AgentRow,
  type AgentStatus,
  type CallOverview,
  type CallOutcome,
  type CallStats,
  type IvrCall,
  type QueuedCall,
  type RecentCall,
  type SoftphoneConfig,
  type SoftphoneEventKind,
  type VolumePoint,
} from "@/lib/api/callcenter";
import { feedBus } from "@/components/om/feed-bus";
import { toast } from "@/lib/om/toast";

interface CallCenterValue {
  loading: boolean;
  status: AgentStatus;
  setStatus: (s: AgentStatus) => void;
  active: ActiveCall | null;
  queue: QueuedCall[];
  recent: RecentCall[];
  agents: AgentRow[];
  stats: CallStats | null;
  volume: VolumePoint[];
  dial: (name: string, number: string) => void;
  answer: (id: string) => void;
  hangup: (outcome?: CallOutcome) => void;
  toggleMute: () => void;
  toggleHold: () => void;
  dismissQueued: (id: string) => void;
  simulateInbound: () => void;
  ivrCalls: IvrCall[];
  softphone: SoftphoneConfig | null;
  setAgentSip: (agentId: string, ext: string, password: string) => void;
  /** browser softphone reporting its own SIP session lifecycle */
  softphoneEvent: (kind: SoftphoneEventKind, number?: string, name?: string) => void;
  busy: boolean;
}

const Ctx = createContext<CallCenterValue | null>(null);
const KEY = ["call-center", "overview"] as const;
const POLL_KEY = ["call-center", "poll"] as const;

export function CallCenterProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: KEY,
    queryFn: callCenterApi.overview,
    refetchInterval: 6000,
  });

  const { data: softphone } = useQuery({
    queryKey: ["call-center", "softphone"],
    queryFn: callCenterApi.softphoneConfig,
    staleTime: 60_000,
  });

  const onSuccess = (o: CallOverview) => {
    qc.setQueryData(KEY, o);
    qc.setQueryData(POLL_KEY, {
      queue: o.queue,
      active: o.active,
      presence: o.presence,
      ivrCalls: o.ivrCalls,
    });
  };
  const onError = (e: Error) => toast.err(e.message);

  const dialM = useMutation({
    mutationFn: (v: { name: string; number: string }) => callCenterApi.dial(v.name, v.number),
    onSuccess,
    onError,
  });
  const answerM = useMutation({ mutationFn: (id: string) => callCenterApi.answer(id), onSuccess, onError });
  const hangupM = useMutation({
    mutationFn: (v: { id: string; outcome: CallOutcome }) => callCenterApi.hangup(v.id, v.outcome),
    onSuccess,
    onError,
  });
  const flagsM = useMutation({
    mutationFn: (v: { id: string; muted?: boolean; on_hold?: boolean }) =>
      callCenterApi.flags(v.id, { muted: v.muted, on_hold: v.on_hold }),
    onSuccess,
    onError,
  });
  const dismissM = useMutation({ mutationFn: (id: string) => callCenterApi.dismiss(id), onSuccess, onError });
  const presenceM = useMutation({
    mutationFn: (s: AgentStatus) => callCenterApi.presence(s),
    onSuccess,
    onError,
  });
  const inboundM = useMutation({ mutationFn: () => callCenterApi.simulateInbound(), onSuccess, onError });
  const sipEventM = useMutation({
    mutationFn: (v: { kind: SoftphoneEventKind; number?: string; name?: string }) =>
      callCenterApi.softphoneEvent(v.kind, v.number, v.name),
    onSuccess,
    // a stale/again event isn't worth a toast
    onError: () => undefined,
  });
  const agentSipM = useMutation({
    mutationFn: (v: { agentId: string; ext: string; password: string }) =>
      callCenterApi.setAgentSip(v.agentId, v.ext, v.password),
    onSuccess: (o) => {
      onSuccess(o);
      qc.invalidateQueries({ queryKey: ["call-center", "softphone"] });
      toast.ok("Agent line saved");
    },
    onError,
  });

  const busy =
    dialM.isPending ||
    answerM.isPending ||
    hangupM.isPending ||
    flagsM.isPending ||
    dismissM.isPending;

  const active = data?.active ?? null;

  const value = useMemo<CallCenterValue>(
    () => ({
      loading: isLoading,
      status: data?.presence ?? "available",
      setStatus: (s) => {
        presenceM.mutate(s);
        feedBus.emit(`Presence set to ${s}`, "info");
      },
      active,
      queue: data?.queue ?? [],
      recent: data?.recent ?? [],
      agents: data?.agents ?? [],
      stats: data?.stats ?? null,
      volume: data?.volume ?? [],
      dial: (name, number) => {
        if (active) return toast.warn("End the current call first");
        dialM.mutate({ name: name || "Unknown", number });
        feedBus.emit(`Dialing ${name || "Unknown"} · ${number}`, "ok");
      },
      answer: (id) => {
        if (active) return toast.warn("End the current call first");
        const q = data?.queue.find((c) => c.id === id);
        answerM.mutate(id);
        if (q) feedBus.emit(`Answered ${q.name} · ${q.number}`, "ok");
      },
      hangup: (outcome = "completed") => {
        if (!active) return;
        hangupM.mutate({ id: active.id, outcome });
        feedBus.emit(`Call with ${active.name} ended · ${outcome}`, "info");
      },
      toggleMute: () => {
        if (active) flagsM.mutate({ id: active.id, muted: !active.muted });
      },
      toggleHold: () => {
        if (active) flagsM.mutate({ id: active.id, on_hold: !active.onHold });
      },
      dismissQueued: (id) => dismissM.mutate(id),
      simulateInbound: () => inboundM.mutate(),
      ivrCalls: data?.ivrCalls ?? [],
      softphone: softphone ?? null,
      setAgentSip: (agentId, ext, password) => agentSipM.mutate({ agentId, ext, password }),
      softphoneEvent: (kind, number, name) => sipEventM.mutate({ kind, number, name }),
      busy,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, isLoading, active, busy, softphone],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCallCenter(): CallCenterValue {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useCallCenter must be used within <CallCenterProvider>");
  return ctx;
}
