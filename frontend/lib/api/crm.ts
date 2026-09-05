import { http, qs } from "./http";

export type CustomerStage = "lead" | "prospect" | "trial" | "active" | "churned";
export type CustomerStatus = "active" | "inactive" | "archived";
export type CustomerSourceType = "lead" | "manual" | "import" | "referral";

export interface Customer {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  position: string | null;
  website_url: string | null;
  location: string | null;
  country: string | null;
  linkedin_url: string | null;
  instagram_handle: string | null;
  twitter_handle: string | null;
  stage: CustomerStage;
  status: CustomerStatus;
  source: CustomerSourceType;
  lifetime_value: number | null;
  monthly_value: number | null;
  currency: string;
  last_contact_at: string | null;
  next_action: string | null;
  next_action_at: string | null;
  tags: string[];
  notes: string | null;
  ai_summary: string | null;
  ai_recommendation: string | null;
  owner_id: string | null;
  workspace_id: string;
  lead_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface CustomerList {
  items: Customer[];
  total: number;
  limit: number;
  offset: number;
}

export interface CustomerSummary {
  total: number;
  by_stage: Record<CustomerStage, number>;
  active: number;
  churned: number;
  total_mrr: number;
  total_ltv: number;
  added_this_month: number;
  from_leads: number;
  needs_follow_up: number;
}

export type InteractionKind = "call" | "email" | "whatsapp" | "sms" | "meeting" | "note";

export interface CustomerInteraction {
  id: string;
  kind: InteractionKind;
  direction: "in" | "out" | null;
  note: string | null;
  occurred_at: string;
  created_at: string;
}

export interface LogContactBody {
  kind: InteractionKind;
  direction?: "in" | "out" | null;
  note?: string;
  occurred_at?: string;
}

export interface CustomerCreate {
  name: string;
  email?: string;
  phone?: string;
  company?: string;
  position?: string;
  website_url?: string;
  location?: string;
  linkedin_url?: string;
  stage?: CustomerStage;
  source?: CustomerSourceType;
  monthly_value?: number;
  lifetime_value?: number;
  currency?: string;
  next_action?: string;
  tags?: string[];
  notes?: string;
}

export interface CustomerFilters {
  search?: string;
  stage?: CustomerStage;
  status?: CustomerStatus;
  source?: CustomerSourceType;
  not_contacted_days?: number;
  limit?: number;
  offset?: number;
}

export const crmApi = {
  list: (f: CustomerFilters = {}) => http.get<CustomerList>(`/customers${qs({ ...f })}`),
  summary: () => http.get<CustomerSummary>("/customers/summary"),
  get: (id: string) => http.get<Customer>(`/customers/${id}`),
  create: (body: CustomerCreate) => http.post<Customer>("/customers", body),
  update: (id: string, body: Partial<CustomerCreate> & { last_contact_at?: string }) =>
    http.patch<Customer>(`/customers/${id}`, body),
  remove: (id: string) => http.del<void>(`/customers/${id}`),
  logContact: (id: string, body: LogContactBody) =>
    http.post<Customer>(`/customers/${id}/log-contact`, body),
  interactions: (id: string) =>
    http.get<{ items: CustomerInteraction[] }>(`/customers/${id}/interactions`),
  deleteInteraction: (id: string, interactionId: string) =>
    http.del<void>(`/customers/${id}/interactions/${interactionId}`),
};
