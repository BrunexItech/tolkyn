import { http, qs } from "./http";

export type SocialLeadIntent = "hot" | "warm" | "cold" | "none";
export type SocialLeadStatus =
  | "new"
  | "contacted"
  | "qualified"
  | "converted"
  | "dismissed";

/** Real statuses plus the two virtual worklist views the list endpoint
 * understands: "open" = everything not yet converted or dismissed,
 * "handled" = the opposite. */
export type SocialLeadStatusFilter = SocialLeadStatus | "open" | "handled";

export interface SocialLead {
  id: string;
  platform: string;
  kind: string;
  author_name: string;
  author_handle: string | null;
  author_avatar: string | null;
  message: string;
  post_context: string | null;
  permalink: string | null;

  is_lead: boolean;
  product_interest: string | null;
  intent: SocialLeadIntent;
  buying_signals: string[];
  sentiment: string | null;
  confidence: number | null;
  ai_summary: string | null;
  suggested_reply: string | null;
  classifier: string | null;
  classified_at: string | null;

  status: SocialLeadStatus;
  thread_external_id: string | null;
  inbox_thread_id: string | null;
  converted_customer_id: string | null;

  detected_at: string | null;
  last_message_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SocialLeadList {
  items: SocialLead[];
  total: number;
  limit: number;
  offset: number;
}

export interface SocialLeadSummary {
  total: number;
  leads: number;
  new: number;
  hot: number;
  warm: number;
  cold: number;
  converted: number;
  dismissed: number;
  open: number;
  by_platform: Record<string, number>;
  by_product: { name: string; count: number }[];
  live: boolean;
  ai: boolean;
  last_scan_at: string | null;
}

export interface ScanResult {
  scanned: number;
  classified: number;
  new_leads: number;
  updated: number;
  message: string;
  ai: boolean;
  live: boolean;
}

export interface SocialLeadFilters {
  status?: SocialLeadStatusFilter;
  intent?: SocialLeadIntent;
  platform?: string;
  leads_only?: boolean;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface ConvertSocialLeadBody {
  stage?: string;
  monthly_value?: number;
  next_action?: string;
  email?: string;
  phone?: string;
}

export const socialLeadsApi = {
  list: (f: SocialLeadFilters = {}) =>
    http.get<SocialLeadList>(`/social-leads${qs({ ...f })}`),
  summary: () => http.get<SocialLeadSummary>("/social-leads/summary"),
  scan: () => http.post<ScanResult>("/social-leads/scan"),
  get: (id: string) => http.get<SocialLead>(`/social-leads/${id}`),
  setStatus: (id: string, status: SocialLeadStatus) =>
    http.post<SocialLead>(`/social-leads/${id}/status`, { status }),
  reclassify: (id: string) => http.post<SocialLead>(`/social-leads/${id}/reclassify`),
  reply: (id: string, body: string) =>
    http.post<SocialLead>(`/social-leads/${id}/reply`, { body }),
  convert: (id: string, body: ConvertSocialLeadBody) =>
    http.post<{ customer_id: string; already: boolean }>(
      `/social-leads/${id}/convert`,
      body,
    ),
};
