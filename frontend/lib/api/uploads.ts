import { http } from "./http";
import { mediaUrl } from "./studio";

export interface Upload {
  id: string;
  kind: "image" | "video" | "audio" | "file";
  url: string;
  filename: string | null;
  content_type: string | null;
  size_bytes: number | null;
  workspace_id: string;
  created_at: string;
}

export async function uploadFile(file: File): Promise<Upload> {
  const fd = new FormData();
  fd.append("file", file);
  return http.upload<Upload>("/uploads", fd);
}

export { mediaUrl };
