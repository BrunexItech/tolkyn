import {
  getAccessToken,
  getRefreshToken,
  setSession,
  endSession,
} from "@/lib/session";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

export class ApiError extends Error {
  status: number;
  /** Machine-readable-ish: the raw `detail` payload when it wasn't a string. */
  payload: unknown;
  constructor(message: string, status: number, payload?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.payload = payload;
  }
}

/** Pre-session / session-establishing calls: a 401 here is a real answer
 * ("wrong password"), not an expired session, so we never refresh or log out. */
const NO_REFRESH_PATHS = [
  "/auth/login",
  "/auth/register",
  "/auth/refresh",
  "/auth/forgot-password",
  "/auth/reset-password",
  "/auth/verify-email",
];

function detailFrom(data: unknown, status: number): string {
  const d = (data ?? {}) as { detail?: unknown; message?: string };
  if (Array.isArray(d.detail)) {
    // FastAPI validation error: [{ loc: [...], msg, type }]
    const parts = d.detail
      .map((e) => {
        const err = e as { loc?: unknown[]; msg?: string };
        const field = Array.isArray(err.loc)
          ? err.loc.filter((p) => p !== "body").join(".")
          : "";
        return field ? `${field}: ${err.msg}` : err.msg;
      })
      .filter(Boolean);
    if (parts.length) return parts.join("; ");
  }
  if (typeof d.detail === "string" && d.detail) return d.detail;
  if (typeof d.message === "string" && d.message) return d.message;
  if (typeof data === "string" && data) return data;
  return `Request failed (${status})`;
}

// ---- token refresh -------------------------------------------------------
// One shared in-flight refresh so a burst of parallel 401s triggers a single
// /auth/refresh. Once it fails, the session is dead — stop retrying.
let refreshInFlight: Promise<boolean> | null = null;
let sessionDead = false;

async function doRefresh(): Promise<boolean> {
  const rt = getRefreshToken();
  if (!rt) return false;
  try {
    const res = await fetch(`${API_URL}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: rt }),
    });
    if (!res.ok) return false;
    const data = (await res.json().catch(() => null)) as
      | { access_token?: string; refresh_token?: string }
      | null;
    if (!data?.access_token) return false;
    setSession(data.access_token, data.refresh_token || rt);
    return true;
  } catch {
    return false;
  }
}

async function tryRefresh(): Promise<boolean> {
  if (sessionDead) return false;
  if (!refreshInFlight) {
    refreshInFlight = doRefresh().finally(() => {
      refreshInFlight = null;
    });
  }
  const ok = await refreshInFlight;
  if (!ok) sessionDead = true;
  return ok;
}

// ---- core request -------------------------------------------------------
interface Opts {
  /** raw body (FormData) — skips JSON serialisation and Content-Type */
  form?: BodyInit;
  /** internal: this is already the post-refresh retry, don't loop */
  _retry?: boolean;
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  opts: Opts = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  if (!opts.form) headers["Content-Type"] = "application/json";
  const t = getAccessToken();
  if (t) headers["Authorization"] = `Bearer ${t}`;

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: opts.form
        ? opts.form
        : body === undefined
          ? undefined
          : JSON.stringify(body),
    });
  } catch {
    // Network failure / server unreachable — surface it, never swallow it.
    throw new ApiError(
      "Can't reach the server. Check your connection and try again.",
      0,
    );
  }

  // Expired / invalid session on an authenticated call: refresh once, retry
  // once, otherwise end the session cleanly.
  if (
    res.status === 401 &&
    !opts._retry &&
    !NO_REFRESH_PATHS.some((p) => path.startsWith(p))
  ) {
    if (await tryRefresh()) {
      return request<T>(method, path, body, { ...opts, _retry: true });
    }
    endSession("expired");
    throw new ApiError("Your session has expired. Please sign in again.", 401);
  }

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!res.ok) {
    throw new ApiError(detailFrom(data, res.status), res.status, data);
  }
  return data as T;
}

export const http = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body),
  put: <T>(path: string, body?: unknown) => request<T>("PUT", path, body),
  patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, body),
  del: <T>(path: string) => request<T>("DELETE", path),
  /** multipart / file upload — same auth + 401 handling as the JSON verbs */
  upload: <T>(path: string, form: FormData, method = "POST") =>
    request<T>(method, path, undefined, { form }),
};

/** Call after a successful login/register so the refresh machinery re-arms
 * for the new session (the previous one may have died in this tab). */
export function resetSessionGuards() {
  sessionDead = false;
  refreshInFlight = null;
}

export function qs(
  params: Record<string, string | number | boolean | undefined | null>,
): string {
  const entries = Object.entries(params).filter(
    ([, v]) => v !== undefined && v !== null && v !== "",
  );
  if (!entries.length) return "";
  return (
    "?" + entries.map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join("&")
  );
}
