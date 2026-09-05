import { mediaUrl } from "./studio";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

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

function token(): string | null {
  return typeof window === "undefined" ? null : localStorage.getItem("access_token");
}

export async function uploadFile(file: File): Promise<Upload> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch(`${API_URL}/uploads`, {
    method: "POST",
    headers: token() ? { Authorization: `Bearer ${token()}` } : {},
    body: fd,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.detail || `Upload failed (${res.status})`);
  return data as Upload;
}

export { mediaUrl };
