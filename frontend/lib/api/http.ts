const API_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

function token(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("access_token");
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  init?: RequestInit,
): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const t = token();
  if (t) headers["Authorization"] = `Bearer ${t}`;

  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    ...init,
  });

  if (res.status === 204) return undefined as T;

  let data: unknown = null;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!res.ok) {
    const d = (data ?? {}) as { detail?: unknown; message?: string };
    let detail: string;
    if (Array.isArray(d.detail)) {
      // FastAPI validation error: [{ loc: [...], msg: "...", type: "..." }]
      detail = d.detail
        .map((e) => {
          const err = e as { loc?: unknown[]; msg?: string };
          const field = Array.isArray(err.loc) ? err.loc.filter((p) => p !== "body").join(".") : "";
          return field ? `${field}: ${err.msg}` : err.msg;
        })
        .filter(Boolean)
        .join("; ");
    } else {
      detail =
        (typeof d.detail === "string" && d.detail) ||
        d.message ||
        `Request failed (${res.status})`;
    }
    throw new ApiError(detail, res.status);
  }
  return data as T;
}

export const http = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body),
  put: <T>(path: string, body?: unknown) => request<T>("PUT", path, body),
  patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, body),
  del: <T>(path: string) => request<T>("DELETE", path),
};

export function qs(params: Record<string, string | number | boolean | undefined | null>): string {
  const entries = Object.entries(params).filter(
    ([, v]) => v !== undefined && v !== null && v !== "",
  );
  if (!entries.length) return "";
  return "?" + entries.map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join("&");
}
