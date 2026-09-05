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

export interface ImageResponse {
  asset_id: string | null;
  id: string;
  url: string;
  prompt: string;
  size: string;
  quality: string;
  model: string;
  style: string;
}

export interface ImageChatTurn {
  role: "user" | "assistant";
  text: string;
}

export interface ImageChatResponse {
  asset_id: string | null;
  id: string;
  url: string;
  prompt: string;
  size: string;
  quality: string;
  model: string;
  reply: string;
  operation: string;
  used_base: string;
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
  }) => http.post<ImageResponse>("/studio/image", body),
  imageChat: (body: {
    instruction: string;
    attachment_url?: string;
    previous_image_url?: string;
    history?: ImageChatTurn[];
  }) => http.post<ImageChatResponse>("/studio/image/chat", body),
  assets: (kind?: AssetKind) => http.get<{ items: GeneratedAsset[] }>(`/studio/assets${qs({ kind })}`),
  deleteAsset: (id: string) => http.del<void>(`/studio/assets/${id}`),
  saveCaption: (body: {
    title: string;
    platform: string;
    text: string;
    hashtags: string[];
    angle?: string;
    brief?: string;
  }) => http.post<GeneratedAsset>("/studio/captions", body),
};
