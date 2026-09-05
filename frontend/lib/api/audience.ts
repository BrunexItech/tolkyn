import { http, qs } from "./http";
import type { PlatformRow } from "./analytics";

export interface Contact {
  id: string;
  kind: "lead" | "customer";
  name: string;
  company: string | null;
  email: string | null;
  country: string | null;
  location: string | null;
  tags: string[];
  meta: string;
  source: string;
  created_at: string | null;
}

export interface AudienceOverview {
  contacts: number;
  leads: number;
  customers: number;
  followers_total: number;
  by_platform: PlatformRow[];
  by_country: [string, number][];
  by_source: Record<string, number>;
}

export interface Segment {
  id: string;
  name: string;
  description: string | null;
  source: string;
  filters: Record<string, string>;
  color: string | null;
  count: number;
  workspace_id: string;
  created_at: string;
  updated_at: string;
}

export interface ContactFilters {
  source?: string;
  country?: string;
  tag?: string;
  meta?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export const audienceApi = {
  overview: () => http.get<AudienceOverview>("/audience/overview"),
  contacts: (f: ContactFilters = {}) =>
    http.get<{ items: Contact[]; total: number }>(`/audience/contacts${qs({ ...f })}`),
  segments: () => http.get<{ items: Segment[] }>("/audience/segments"),
  createSegment: (body: { name: string; source: string; filters: Record<string, string> }) =>
    http.post<Segment>("/audience/segments", body),
  deleteSegment: (id: string) => http.del<void>(`/audience/segments/${id}`),
};
