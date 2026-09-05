import { http, qs } from "./http";

export type PostStatus =
  | "draft"
  | "needs_approval"
  | "scheduled"
  | "publishing"
  | "published"
  | "partial"
  | "failed";

export interface MediaItem {
  url: string;
  alt: string;
  type: "image" | "video";
}

export interface MusicTrack {
  url: string;
  title: string;
}

export interface Finding {
  platform: string;
  level: "error" | "warn" | "info";
  message: string;
}

export interface ChecksResult {
  ok: boolean;
  errors: number;
  warnings: number;
  findings: Finding[];
  char_count: number;
  hashtag_count: number;
  link_count: number;
  has_media: boolean;
}

export interface Post {
  id: string;
  title: string | null;
  body: string;
  platforms: string[];
  media: MediaItem[];
  music: MusicTrack | null;
  link: string | null;
  hashtags: string[];
  status: PostStatus;
  scheduled_at: string | null;
  published_at: string | null;
  per_platform: Record<string, { status?: string; url?: string; error?: string; simulated?: boolean }>;
  provider_jobs: { mode?: string; job_id?: string; request_id?: string; scheduled_date?: string } | null;
  checks: ChecksResult | null;
  campaign_id: string | null;
  owner_id: string | null;
  pending_scheduled_at: string | null;
  pending_timezone: string | null;
  rejection_reason: string | null;
  approved_by: string | null;
  approved_at: string | null;
  workspace_id: string;
  created_at: string;
  updated_at: string;
}

export interface PostInput {
  title?: string;
  body?: string;
  platforms?: string[];
  media?: MediaItem[];
  music?: MusicTrack | null;
  link?: string | null;
  hashtags?: string[];
  scheduled_at?: string | null;
  campaign_id?: string | null;
}

export const postsApi = {
  list: (status?: PostStatus) => http.get<{ items: Post[]; total: number }>(`/posts${qs({ status })}`),
  summary: () => http.get<Record<string, number>>("/posts/summary"),
  calendar: (start?: string, end?: string) =>
    http.get<{ items: Post[]; total: number }>(`/posts/calendar${qs({ start, end })}`),
  get: (id: string) => http.get<Post>(`/posts/${id}`),
  create: (body: PostInput) => http.post<Post>("/posts", body),
  update: (id: string, body: PostInput) => http.patch<Post>(`/posts/${id}`, body),
  remove: (id: string) => http.del<void>(`/posts/${id}`),
  check: (id: string) => http.post<ChecksResult>(`/posts/${id}/check`),
  schedule: (id: string, scheduled_at: string, timezone?: string) =>
    http.post<Post>(`/posts/${id}/schedule`, { scheduled_at, timezone }),
  unschedule: (id: string) => http.post<Post>(`/posts/${id}/unschedule`),
  publish: (id: string) => http.post<Post>(`/posts/${id}/publish`),
  approve: (id: string) => http.post<Post>(`/posts/${id}/approve`),
  reject: (id: string, reason: string) => http.post<Post>(`/posts/${id}/reject`, { reason }),
  refresh: (id: string) => http.post<Post>(`/posts/${id}/refresh`),
  retry: (id: string) => http.post<Post>(`/posts/${id}/retry`),
  runScheduler: () => http.post<{ published: number }>("/posts/run-scheduler"),
};
