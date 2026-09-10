import { http } from "./http";

export type CallDirection = "inbound" | "outbound";
export type CallOutcome = "completed" | "missed" | "voicemail" | "transferred";
export type AgentStatus = "available" | "on-call" | "away" | "offline";

export interface QueuedCall {
  id: string;
  name: string;
  number: string;
  reason: string;
  waitedSec: number;
}

export interface RecentCall {
  id: string;
  name: string;
  number: string;
  direction: CallDirection;
  outcome: CallOutcome;
  durationSec: number;
  at: string;
  recorded: boolean;
}

export interface ActiveCall {
  id: string;
  name: string;
  number: string;
  direction: CallDirection;
  startedAt: string;
  muted: boolean;
  onHold: boolean;
}

export interface AgentRow {
  id: string;
  name: string;
  initials: string;
  status: AgentStatus;
  callsToday: number;
  isSelf: boolean;
  sipExtension: string | null;
}

export interface CallStats {
  callsToday: number;
  callsDelta: number;
  avgHandleSec: number;
  ahtDelta: number;
  answerRate: number;
  answerDelta: number;
  missed: number;
  missedDelta: number;
}

export interface VolumePoint {
  name: string;
  Inbound: number;
  Outbound: number;
}

export interface CallOverview {
  stats: CallStats;
  queue: QueuedCall[];
  recent: RecentCall[];
  agents: AgentRow[];
  volume: VolumePoint[];
  active: ActiveCall | null;
  presence: AgentStatus;
  ivrCalls: IvrCall[];
}

export interface IvrCall {
  id: string;
  name: string;
  number: string;
  menu: string;
  prompt: string;
}

export interface CallPoll {
  queue: QueuedCall[];
  active: ActiveCall | null;
  presence: AgentStatus;
  ivrCalls: IvrCall[];
}

export type IvrAction =
  | "ring_all"
  | "ring_agent"
  | "submenu"
  | "voicemail"
  | "message"
  | "transfer"
  | "hangup"
  | "repeat";

export interface IvrOption {
  digit: string;
  label: string;
  action: IvrAction;
  target: string;
}

export interface IvrMenu {
  prompt: string;
  options: IvrOption[];
}

export interface IvrFlow {
  is_active: boolean;
  greeting: string;
  invalid_message: string;
  timeout_message: string;
  timeout_seconds: number;
  max_retries: number;
  on_exhausted: "ring_all" | "voicemail" | "hangup";
  menus: Record<string, IvrMenu>;
  hours_enabled: boolean;
  timezone: string;
  hours: Record<string, string[][]>;
  after_hours_action: "ring_all" | "voicemail" | "hangup" | "message";
  after_hours_message: string;
}

export interface IvrSimulateResult {
  transcript: { kind: string; text: string }[];
  resolved: { action: string; target: string; label: string };
}

export interface SoftphoneConfig {
  /** true only when a real SIP trunk is active AND this agent has a line assigned */
  configured: boolean;
  provider: string; // simulated | cloudone | asterisk
  ws_url: string | null;
  domain: string | null;
  extension: string | null;
  password: string | null;
  display_name: string | null;
  turn_url: string | null;
  turn_user: string | null;
  turn_password: string | null;
}

export const callCenterApi = {
  overview: () => http.get<CallOverview>("/call-center/overview"),
  poll: () => http.get<CallPoll>("/call-center/poll"),
  dial: (name: string, number: string) =>
    http.post<CallOverview>("/call-center/dial", { name, number }),
  answer: (id: string) => http.post<CallOverview>(`/call-center/calls/${id}/answer`),
  hangup: (id: string, outcome: CallOutcome = "completed") =>
    http.post<CallOverview>(`/call-center/calls/${id}/hangup`, { outcome }),
  flags: (id: string, flags: { muted?: boolean; on_hold?: boolean }) =>
    http.post<CallOverview>(`/call-center/calls/${id}/flags`, flags),
  dismiss: (id: string) => http.post<CallOverview>(`/call-center/calls/${id}/dismiss`),
  presence: (status: AgentStatus) =>
    http.post<CallOverview>("/call-center/presence", { status }),
  simulateInbound: () => http.post<CallOverview>("/call-center/simulate-inbound"),
  softphoneConfig: () => http.get<SoftphoneConfig>("/call-center/softphone"),
  setAgentSip: (agentId: string, sip_extension: string, sip_password: string) =>
    http.patch<CallOverview>(`/call-center/agents/${agentId}/sip`, { sip_extension, sip_password }),

  getIvr: () => http.get<IvrFlow>("/call-center/ivr"),
  updateIvr: (patch: Partial<IvrFlow>) => http.put<IvrFlow>("/call-center/ivr", patch),
  testIvr: (digits: string[]) =>
    http.post<IvrSimulateResult>("/call-center/ivr/test", { digits }),
  simulateIvrCall: () => http.post<CallOverview>("/call-center/ivr/simulate-call"),
  ivrPress: (callId: string, digit: string) =>
    http.post<CallOverview>(`/call-center/calls/${callId}/ivr-press`, { digits: [digit] }),
};
