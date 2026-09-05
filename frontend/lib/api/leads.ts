import { http, qs } from "./http";

export type LeadScore = "hot" | "warm" | "cold" | "unknown";
export type LeadStatus =
  | "new"
  | "contacted"
  | "qualified"
  | "proposal"
  | "negotiation"
  | "closed_won"
  | "closed_lost"
  | "unqualified";
export type LeadSourceType =
  | "linkedin"
  | "instagram"
  | "facebook"
  | "twitter"
  | "website"
  | "email"
  | "referral"
  | "manual"
  | "scraped";

export interface Lead {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  position: string | null;
  industry: string | null;
  linkedin_url: string | null;
  instagram_handle: string | null;
  facebook_url: string | null;
  twitter_handle: string | null;
  website_url: string | null;
  location: string | null;
  country: string | null;
  city: string | null;
  source: LeadSourceType;
  status: LeadStatus;
  score: LeadScore;
  engagement_level: string;
  ai_confidence_score: number | null;
  ai_summary: string | null;
  ai_recommendation: string | null;
  ai_intent_signals: string[] | null;
  outreach_angle: string | null;
  seniority: string | null;
  key_facts: string[];
  offer: string | null;
  sender_company: string | null;
  has_outreach: boolean;
  outreach_subject: string | null;
  outreach_email: string | null;
  outreach_proposal: string | null;
  outreach_generated_at: string | null;
  outreach_sent_at: string | null;
  outreach_sent_count: number;
  estimated_value: number | null;
  tags: string[];
  notes: string | null;
  workspace_id: string;
  converted_customer_id: string | null;
  converted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface LeadList {
  items: Lead[];
  total: number;
  limit: number;
  offset: number;
}

export interface LeadSummary {
  total_leads: number;
  hot_leads: number;
  warm_leads: number;
  cold_leads: number;
  new_leads: number;
  contacted_leads: number;
  qualified_leads: number;
  closed_won_leads: number;
  conversion_rate: number;
}

export interface GenerateRequest {
  url: string;
  max_pages?: number;
  max_depth?: number;
  enrich?: boolean;
  icp_keywords?: string[];
}

export interface GenerateResponse {
  success: boolean;
  url: string;
  message: string;
  stats: {
    pages_crawled: number;
    candidates: number;
    unique: number;
    enriched: number;
    saved: number;
    skipped_duplicates: number;
    duration_seconds: number;
  };
  leads: Lead[];
}

export interface DiscoverRequest {
  prompt: string;
  offer?: string;
  from_company?: string;
  from_website?: string;
  max_results?: number;
  target_area_ids?: string[];
}

export interface DiscoverResponse {
  success: boolean;
  prompt: string;
  target_profile: string;
  message: string;
  stats: {
    sites_scanned: number;
    companies_found: number;
    qualified: number;
    saved: number;
    skipped_duplicates: number;
    duration_seconds: number;
  };
  leads: Lead[];
}

export interface Outreach {
  lead_id: string;
  subject: string;
  email_body: string;
  proposal: string;
  generated_by: string;
  generated_at: string;
}

export interface LeadCreate {
  name: string;
  email?: string;
  phone?: string;
  company?: string;
  position?: string;
  industry?: string;
  location?: string;
  linkedin_url?: string;
  website_url?: string;
  source?: LeadSourceType;
  notes?: string;
  tags?: string[];
}

export interface LeadFilters {
  search?: string;
  status?: LeadStatus;
  score?: LeadScore;
  source?: LeadSourceType;
  converted?: boolean;
  limit?: number;
  offset?: number;
}

export const leadsApi = {
  list: (f: LeadFilters = {}) => http.get<LeadList>(`/leads${qs({ ...f })}`),
  summary: () => http.get<LeadSummary>("/leads/summary"),
  get: (id: string) => http.get<Lead>(`/leads/${id}`),
  create: (body: LeadCreate) => http.post<Lead>("/leads", body),
  update: (id: string, body: Partial<LeadCreate> & { status?: LeadStatus; score?: LeadScore }) =>
    http.patch<Lead>(`/leads/${id}`, body),
  remove: (id: string) => http.del<void>(`/leads/${id}`),
  generate: (body: GenerateRequest) => http.post<GenerateResponse>("/leads/generate", body),
  discover: (body: DiscoverRequest) => http.post<DiscoverResponse>("/leads/discover", body),
  getOutreach: (id: string) => http.get<Outreach>(`/leads/${id}/outreach`),
  generateOutreach: (
    id: string,
    body: {
      offer?: string;
      from_company?: string;
      from_website?: string;
      tone?: string;
      regenerate?: boolean;
    },
  ) => http.post<Outreach>(`/leads/${id}/outreach`, body),
  convert: (
    id: string,
    body: { stage?: string; monthly_value?: number; lifetime_value?: number; next_action?: string },
  ) => http.post<{ id: string }>(`/leads/${id}/convert`, body),
  send: (id: string, body: { email_account_id: string; include_proposal?: boolean }) =>
    http.post<import("./email").SendResult>(`/leads/${id}/send`, body),
  sendBulk: (body: { lead_ids: string[]; email_account_id: string; include_proposal?: boolean }) =>
    http.post<import("./email").BulkSendResult>("/leads/send-bulk", body),
};
