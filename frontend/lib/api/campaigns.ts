import { http } from "./http";

export type CampaignObjective = "awareness" | "engagement" | "leads" | "traffic" | "sales";
export type CampaignStatus = "draft" | "active" | "paused" | "completed";

export interface Campaign {
  id: string;
  name: string;
  objective: CampaignObjective;
  status: CampaignStatus;
  brief: string | null;
  channels: string[];
  color: string | null;
  start_at: string | null;
  end_at: string | null;
  budget: number | null;
  goal_metric: string | null;
  goal_target: number | null;
  target_area_ids: string[];
  target_area_labels: string[];
  workspace_id: string;
  created_at: string;
  updated_at: string;
}

export interface CampaignMetrics {
  posts: number;
  published: number;
  scheduled: number;
  reach: number;
  engaged: number;
  engagement_rate: number;
  leads: number;
  clicks: number;
  goal_value: number;
  goal_progress: number | null;
  budget_spent: number;
  geo_estimated_reach: number | null;
}

export interface CampaignDetail extends Campaign {
  metrics: CampaignMetrics;
  posts: {
    id: string;
    body: string;
    status: string;
    platforms: string[];
    scheduled_at: string | null;
    published_at: string | null;
  }[];
}

export interface CampaignInput {
  name?: string;
  objective?: CampaignObjective;
  status?: CampaignStatus;
  brief?: string;
  channels?: string[];
  color?: string;
  start_at?: string | null;
  end_at?: string | null;
  budget?: number | null;
  goal_metric?: string | null;
  goal_target?: number | null;
  target_area_ids?: string[];
}

export const campaignsApi = {
  list: () => http.get<{ items: Campaign[] }>("/campaigns"),
  summary: () => http.get<{ total: number; active: number; draft: number; completed: number; active_reach: number }>("/campaigns/summary"),
  get: (id: string) => http.get<CampaignDetail>(`/campaigns/${id}`),
  create: (body: CampaignInput) => http.post<Campaign>("/campaigns", body),
  update: (id: string, body: CampaignInput) => http.patch<Campaign>(`/campaigns/${id}`, body),
  remove: (id: string) => http.del<void>(`/campaigns/${id}`),
  attachPost: (id: string, post_id: string, attach: boolean) =>
    http.post<void>(`/campaigns/${id}/posts`, { post_id, attach }),
};
