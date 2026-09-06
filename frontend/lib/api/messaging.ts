import { http, qs } from "./http";

export type BroadcastChannel = "sms" | "whatsapp";
export type BroadcastStatus = "draft" | "sending" | "sent" | "partial" | "failed";

export interface BroadcastRecipient {
  name: string | null;
  phone: string;
  source?: string;
}

export interface BroadcastResult {
  phone: string;
  ok: boolean;
  id: string | null;
  error: string | null;
  simulated: boolean;
}

export interface Broadcast {
  id: string;
  channel: BroadcastChannel;
  status: BroadcastStatus;
  name: string;
  body: string;
  recipients: BroadcastRecipient[];
  total: number;
  sent_count: number;
  failed_count: number;
  results: BroadcastResult[];
  provider: string | null;
  simulated: number;
  scheduled_at: string | null;
  sent_at: string | null;
  workspace_id: string;
  created_at: string;
  updated_at: string;
}

export interface MessagingContact {
  name: string | null;
  company: string | null;
  phone: string;
  country: string | null;
  source: string;
  ref_id: string | null;
}

export interface ContactFilters {
  search?: string;
  source?: "all" | "lead" | "customer";
  status?: string;
  score?: string;
  target_area_ids?: string[];
}

export interface CsvImportResult {
  recipients: BroadcastRecipient[];
  imported: number;
  skipped: number;
  columns: string[];
}

export interface MessagingSummary {
  sms_broadcasts: number;
  whatsapp_broadcasts: number;
  messages_sent: number;
  messages_failed: number;
  sms_provider: string;
  whatsapp_provider: string;
}

export interface BroadcastInput {
  channel?: BroadcastChannel;
  name?: string;
  body?: string;
  recipients?: BroadcastRecipient[];
  scheduled_at?: string | null;
}

export const messagingApi = {
  summary: () => http.get<MessagingSummary>("/messaging/summary"),
  contacts: (f: ContactFilters = {}) => {
    const { target_area_ids, ...rest } = f;
    const base = qs({ ...rest });
    const areaParams = (target_area_ids ?? []).map((id) => `target_area_ids=${encodeURIComponent(id)}`);
    const query = [base.slice(1), ...areaParams].filter(Boolean).join("&");
    return http.get<{ items: MessagingContact[] }>(`/messaging/contacts${query ? `?${query}` : ""}`);
  },
  importCsv: (file: File): Promise<CsvImportResult> => {
    const fd = new FormData();
    fd.append("file", file);
    return http.upload<CsvImportResult>("/messaging/contacts/import", fd);
  },
  list: (channel?: BroadcastChannel) =>
    http.get<{ items: Broadcast[] }>(`/messaging/broadcasts${qs({ channel })}`),
  get: (id: string) => http.get<Broadcast>(`/messaging/broadcasts/${id}`),
  create: (body: BroadcastInput) => http.post<Broadcast>("/messaging/broadcasts", body),
  update: (id: string, body: BroadcastInput) => http.patch<Broadcast>(`/messaging/broadcasts/${id}`, body),
  remove: (id: string) => http.del<void>(`/messaging/broadcasts/${id}`),
  send: (id: string) => http.post<Broadcast>(`/messaging/broadcasts/${id}/send`),
};

export interface WhatsAppWebStatus {
  status: "disconnected" | "connecting" | "qr" | "linking" | "connected" | "logged_out";
  qr: string | null;
  phone: string | null;
}

export const whatsappWebApi = {
  connect: () => http.post<WhatsAppWebStatus>("/messaging/whatsapp-web/connect"),
  status: () => http.get<WhatsAppWebStatus>("/messaging/whatsapp-web/status"),
  disconnect: () => http.del<void>("/messaging/whatsapp-web/disconnect"),
};

// ---- Campaign groups ("communities") — shared conversation, masked identity
export interface CampaignRecipient {
  phone: string;
  name?: string | null;
}

export interface CampaignGroupParticipantRow {
  id: string;
  phone: string; // real identity — admin-only, never sent to other participants
  real_name: string | null;
  pseudo_name: string;
}

export interface CampaignGroupMessageRow {
  id: string;
  participant_id: string | null; // null = the business/admin speaking
  body: string;
  created_at: string;
}

export interface CampaignGroupSummary {
  id: string;
  name: string;
  created_at: string;
  participants: CampaignGroupParticipantRow[];
}

export interface CampaignGroupDetail extends CampaignGroupSummary {
  messages: CampaignGroupMessageRow[];
  send_errors: string[];
}

export interface CampaignGroupCreateResult {
  group: CampaignGroupSummary;
  send_errors: string[];
}

export const campaignGroupApi = {
  list: () => http.get<{ items: CampaignGroupSummary[] }>("/messaging/campaign-groups"),
  get: (id: string) => http.get<CampaignGroupDetail>(`/messaging/campaign-groups/${id}`),
  create: (body: { name: string; recipients: CampaignRecipient[]; initial_message?: string }) =>
    http.post<CampaignGroupCreateResult>("/messaging/campaign-groups", body),
  sendMessage: (id: string, body: string) =>
    http.post<CampaignGroupDetail>(`/messaging/campaign-groups/${id}/messages`, { body }),
};
