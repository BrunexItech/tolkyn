import { http } from "./http";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";
const HOST = API_URL.replace(/\/api\/v1\/?$/, "");

/** Resolve a backend-relative media path (e.g. /media/videos/x.mp4) to an absolute URL. */
export function mediaUrl(path: string | null | undefined): string {
  if (!path) return "";
  if (path.startsWith("http")) return path;
  return `${HOST}${path.startsWith("/") ? "" : "/"}${path}`;
}

export interface VideoModelInfo {
  key: string;
  label: string;
  description: string;
  max_resolution: string;
  /** Selectable resolutions for this model. No pricing here — per-video
   * cost is Super Admin only (see the admin video-usage page). */
  resolutions: string[];
  supports_audio: boolean;
}

export interface VideoModelsResponse {
  models: VideoModelInfo[];
  /** True once this workspace has hit its video budget — a plain flag, not
   * a dollar figure. Budget is enforced server-side regardless. */
  budget_reached: boolean;
  configured: boolean;
  brand_logo_url: string | null;
  brand_colors: string[] | null;
  /** clip lengths this workspace may pick from — set by the super admin */
  allowed_durations: number[];
}

export type VideoJobStatus = "queued" | "running" | "succeeded" | "failed";

export interface VideoJob {
  id: string;
  model_key: string;
  prompt: string;
  negative_prompt: string | null;
  aspect_ratio: string;
  resolution: string;
  duration_seconds: number;
  generate_audio: boolean;
  reference_image_url: string | null;
  brand_logo_url: string | null;
  brand_colors: string[] | null;
  status: VideoJobStatus;
  video_url: string | null;
  thumbnail_url: string | null;
  error_message: string | null;
  created_at: string;
}

export interface VideoGenerateRequest {
  model_key: string;
  prompt: string;
  negative_prompt?: string;
  aspect_ratio: string;
  resolution: string;
  duration_seconds: number;
  reference_image_url?: string;
  /** opt-in: where in the scene to place the real brand logo (a branded first
   * frame is generated and used as the video's starting image) */
  hero_logo_where?: string;
}

export const videoApi = {
  models: () => http.get<VideoModelsResponse>("/video/models"),
  generate: (body: VideoGenerateRequest) => http.post<VideoJob>("/video/generate", body),
  list: () => http.get<{ items: VideoJob[] }>("/video"),
  get: (id: string) => http.get<VideoJob>(`/video/${id}`),
  remove: (id: string) => http.del<void>(`/video/${id}`),
  enhancePrompt: (idea: string, brand_colors?: string[]) =>
    http.post<{ prompt: string }>("/video/enhance-prompt", { idea, brand_colors }),
  setBrand: (logo_url: string, colors: string[]) =>
    http.patch<VideoModelsResponse>("/video/brand", { logo_url, colors }),
  clearBrand: () => http.del<VideoModelsResponse>("/video/brand"),
};
