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
  price_per_second: Record<string, number | null>;
  supports_audio: boolean;
}

export interface VideoModelsResponse {
  models: VideoModelInfo[];
  budget_usd: number | null;
  spent_usd: number;
  configured: boolean;
  brand_logo_url: string | null;
  brand_colors: string[] | null;
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
  cost_usd: number;
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

export function estimateCost(models: VideoModelInfo[], modelKey: string, resolution: string, duration: number): number | null {
  const model = models.find((m) => m.key === modelKey);
  const perSecond = model?.price_per_second[resolution];
  if (perSecond == null) return null;
  return Math.round(perSecond * duration * 100) / 100;
}
