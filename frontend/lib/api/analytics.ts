import { http, qs } from "./http";

export interface Overview {
  provider: string;
  window_days: number;
  connected: string[];
  reach: number;
  reach_delta: number;
  engaged: number;
  engagement_rate: number;
  engagement_delta: number;
  followers: number;
  followers_delta: number;
  new_followers: number;
  profile_views?: number;
  posts_published: number;
  avg_reach_per_post: number;
}

export interface SeriesPoint {
  date: string;
  label: string;
  reach: number;
  engaged: number;
  impressions: number;
}

export interface PlatformRow {
  platform: string;
  handle: string | null;
  followers: number;
  followers_delta: number;
  reach: number;
  engagement_rate: number;
  posts: number;
  best_time: string;
}

export interface TopPost {
  id: string;
  platform: string;
  platforms: string[];
  text: string;
  published_at: string | null;
  reach: number;
  engagement_rate: number;
  likes: number;
  comments: number;
  shares: number;
}

export const analyticsApi = {
  overview: (days = 30) => http.get<Overview>(`/analytics/overview${qs({ days })}`),
  timeseries: (days = 30) => http.get<{ points: SeriesPoint[] }>(`/analytics/timeseries${qs({ days })}`),
  byPlatform: (days = 30) => http.get<{ items: PlatformRow[] }>(`/analytics/by-platform${qs({ days })}`),
  topPosts: (limit = 8) => http.get<{ items: TopPost[] }>(`/analytics/top-posts${qs({ limit })}`),
};
