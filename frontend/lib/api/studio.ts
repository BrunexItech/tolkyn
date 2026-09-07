import { http, qs } from "./http";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";
const HOST = API_URL.replace(/\/api\/v1\/?$/, "");

/** Resolve a backend-relative media path (e.g. /media/generated/x.png) to an absolute URL. */
export function mediaUrl(path: string): string {
  if (!path) return "";
  if (path.startsWith("http")) return path;
  return `${HOST}${path.startsWith("/") ? "" : "/"}${path}`;
}

export type AssetKind = "copy" | "image" | "video_plan";

export interface CopyVariant {
  text: string;
  hashtags: string[];
  angle: string;
  chars: number;
}

export interface CopyGroup {
  platform: string;
  variants: CopyVariant[];
}

export interface CopyResponse {
  asset_id: string | null;
  results: CopyGroup[];
  generated_by: string;
}

export type ImageQuality = "low" | "medium" | "high";

/** "off" | "auto" | a position — where to composite the workspace brand logo. */
export type LogoPlacement =
  | "off"
  | "auto"
  | "top-left"
  | "top-center"
  | "top-right"
  | "center-left"
  | "center"
  | "center-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right";

export interface ImageChatTurn {
  role: "user" | "assistant";
  text: string;
}

export type ImageJobStatus = "queued" | "processing" | "succeeded" | "failed";

/** A background image generation. Created by POST, then polled. */
export interface ImageJob {
  id: string;
  status: ImageJobStatus;
  mode: "generate" | "chat";
  url: string | null;
  asset_id: string | null;
  reply: string | null;
  operation: string | null;
  used_base: string | null;
  logo_applied: string | null;
  logo_note: string | null;
  error: string | null;
}

export interface GeneratedAsset {
  id: string;
  kind: AssetKind;
  prompt: string;
  platform: string | null;
  title: string | null;
  payload: Record<string, unknown> | null;
  image_url: string | null;
  created_at: string;
}

export interface PromptResult {
  prompt: string;
  negative_prompt: string;
  style_tips: string[];
  notes: string;
}

export interface BrandKit {
  brand_logo_url: string | null;
  brand_colors: string[] | null;
}

export const studioApi = {
  copy: (body: { prompt: string; platforms: string[]; count?: number; tone?: string }) =>
    http.post<CopyResponse>("/studio/copy", body),
  buildPrompt: (body: { intent: "image" | "video"; brief: string }) =>
    http.post<PromptResult>("/studio/prompt", body),
  image: (body: {
    prompt: string;
    size?: string;
    quality?: ImageQuality;
    style?: string;
    draft?: boolean;
    input_image_url?: string;
    as_logo?: boolean;
    brand_logo?: LogoPlacement;
  }) => http.post<ImageJob>("/studio/image", body),
  imageChat: (body: {
    instruction: string;
    attachment_url?: string;
    previous_image_url?: string;
    history?: ImageChatTurn[];
    brand_logo?: LogoPlacement;
  }) => http.post<ImageJob>("/studio/image/chat", body),
  imageJob: (id: string) => http.get<ImageJob>(`/studio/image/jobs/${id}`),
  assets: (kind?: AssetKind) => http.get<{ items: GeneratedAsset[] }>(`/studio/assets${qs({ kind })}`),
  deleteAsset: (id: string) => http.del<void>(`/studio/assets/${id}`),
  brand: () => http.get<BrandKit>("/studio/brand"),
  setBrand: (logo_url: string, colors: string[]) =>
    http.patch<BrandKit>("/studio/brand", { logo_url, colors }),
  clearBrand: () => http.del<BrandKit>("/studio/brand"),
  saveCaption: (body: {
    title: string;
    platform: string;
    text: string;
    hashtags: string[];
    angle?: string;
    brief?: string;
  }) => http.post<GeneratedAsset>("/studio/captions", body),
};
