import { http } from "./http";

export type WatchKind = "pulse" | "competitor" | "trend" | "brand";

export interface BriefDevelopment {
  title: string;
  detail: string;
  source_url?: string;
  source_name?: string;
  recency?: string;
}

export interface BriefSource {
  title: string;
  url: string;
  source?: string;
  published?: string | null;
}

export interface Brief {
  topic: string;
  kind: WatchKind;
  headline: string;
  summary: string;
  key_developments: BriefDevelopment[];
  sentiment: string;
  opportunities: string[];
  risks?: string[];
  sources: BriefSource[];
  provider: string;
  generated_at: string;
}

export interface Watch {
  id: string;
  topic: string;
  kind: WatchKind;
  last_brief: Brief | null;
  last_run_at: string | null;
  workspace_id: string;
  created_at: string;
  updated_at: string;
}

export const mediaIntelApi = {
  brief: (topic: string, kind: WatchKind) =>
    http.post<{ brief: Brief }>("/media-intel/brief", { topic, kind }),
  listWatches: () => http.get<{ items: Watch[] }>("/media-intel/watchlist"),
  addWatch: (topic: string, kind: WatchKind) =>
    http.post<Watch>("/media-intel/watchlist", { topic, kind }),
  refreshWatch: (id: string) => http.post<Watch>(`/media-intel/watchlist/${id}/refresh`),
  deleteWatch: (id: string) => http.del<void>(`/media-intel/watchlist/${id}`),
};
