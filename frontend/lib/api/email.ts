import { http } from "./http";

export interface EmailAccount {
  id: string;
  label: string;
  type: "smtp" | "api";
  from_name: string;
  from_email: string;
  reply_to: string | null;
  smtp_host: string | null;
  smtp_port: number | null;
  smtp_username: string | null;
  use_tls: boolean;
  use_ssl: boolean;
  signature: string | null;
  is_default: boolean;
  has_password: boolean;
  verified_at: string | null;
  last_used_at: string | null;
  last_error: string | null;
  daily_limit: number;
  sent_today: number;
  sent_total: number;
  workspace_id: string;
  created_at: string;
  updated_at: string;
}

export interface EmailAccountCreate {
  label: string;
  from_name: string;
  from_email: string;
  reply_to?: string;
  smtp_host?: string;
  smtp_port?: number;
  smtp_username?: string;
  smtp_password?: string;
  use_tls?: boolean;
  use_ssl?: boolean;
  signature?: string;
  daily_limit?: number;
  is_default?: boolean;
}

export interface TestResult {
  ok: boolean;
  message: string;
}

export interface SendResult {
  lead_id: string;
  to_email: string | null;
  status: "sent" | "failed" | "skipped";
  detail: string | null;
}

export interface BulkSendResult {
  sent: number;
  failed: number;
  skipped: number;
  results: SendResult[];
}

export type CampaignSource = "manual" | "leads" | "customers";

export interface ManualRecipient {
  email: string;
  name?: string;
}

export interface RecipientPreview {
  count: number;
  sample: { email: string; name: string; company: string }[];
}

export interface EmailCampaignRow {
  id: string;
  subject: string;
  source: CampaignSource;
  reply_to: string | null;
  total: number;
  sent: number;
  failed: number;
  skipped: number;
  status: string;
  created_at: string;
}

export interface SendCampaignBody {
  subject: string;
  body: string;
  email_account_id?: string;
  source: CampaignSource;
  ids?: string[];
  manual?: ManualRecipient[];
  /** where every customer reply to this blast is routed */
  reply_to?: string;
}

export const emailApi = {
  list: () => http.get<{ items: EmailAccount[] }>("/email-accounts"),
  create: (body: EmailAccountCreate) => http.post<EmailAccount>("/email-accounts", body),
  update: (id: string, body: Partial<EmailAccountCreate>) =>
    http.patch<EmailAccount>(`/email-accounts/${id}`, body),
  remove: (id: string) => http.del<void>(`/email-accounts/${id}`),
  test: (id: string, to_email?: string) =>
    http.post<TestResult>(`/email-accounts/${id}/test`, to_email ? { to_email } : {}),

  // bulk email campaigns
  campaigns: () => http.get<EmailCampaignRow[]>("/email/campaigns"),
  previewRecipients: (body: { source: CampaignSource; ids?: string[]; manual?: ManualRecipient[] }) =>
    http.post<RecipientPreview>("/email/recipients/preview", body),
  sendCampaign: (body: SendCampaignBody) => http.post<EmailCampaignRow>("/email/campaigns", body),
};
