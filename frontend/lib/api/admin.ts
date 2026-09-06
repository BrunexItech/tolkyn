/** API client for the super-admin portal. Deliberately separate from
 * lib/api/http.ts — its own token key (`admin_access_token`), its own error
 * type, so a tenant session and an admin session never collide in the same
 * browser. */
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

function adminToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("admin_access_token");
}

export class AdminApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const t = adminToken();
  if (t) headers["Authorization"] = `Bearer ${t}`;

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new AdminApiError(
      "Can't reach the server. Check your connection and try again.",
      0,
    );
  }

  // Expired / invalid admin session — end it cleanly instead of letting every
  // panel fail with a raw error. The admin login has no refresh token.
  if (res.status === 401 && typeof window !== "undefined") {
    try {
      localStorage.removeItem("admin_access_token");
    } catch {
      /* ignore */
    }
    document.cookie = "admin_access_token=; path=/; max-age=0";
    if (!window.location.pathname.startsWith("/admin/login")) {
      window.location.assign("/admin/login?expired=1");
    }
    throw new AdminApiError("Your session has expired. Please sign in again.", 401);
  }

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
    const d = (data ?? {}) as { detail?: unknown };
    let detail: string;
    if (Array.isArray(d.detail)) {
      detail = d.detail
        .map((e) => {
          const err = e as { loc?: unknown[]; msg?: string };
          const field = Array.isArray(err.loc) ? err.loc.filter((p) => p !== "body").join(".") : "";
          return field ? `${field}: ${err.msg}` : err.msg;
        })
        .filter(Boolean)
        .join("; ");
    } else {
      detail = (typeof d.detail === "string" && d.detail) || `Request failed (${res.status})`;
    }
    throw new AdminApiError(detail, res.status);
  }
  return data as T;
}

function qs(params: Record<string, string | number | boolean | undefined | null>): string {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== "");
  if (!entries.length) return "";
  return "?" + entries.map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join("&");
}

// ------------------------------------------------------------------ types
export interface AdminInfo {
  id: string;
  name: string;
  email: string;
  last_login_at: string | null;
}

export interface AdminTokenResponse {
  admin: AdminInfo;
  access_token: string;
  token_type: string;
  expires_in: number;
}

export type OrgStatus = "active" | "suspended";
export type SubStatus = "active" | "suspended" | "pending";

export interface Subsidiary {
  id: string;
  organization_id: string;
  name: string;
  subdomain: string;
  status: SubStatus;
  workspace_id: string | null;
  notes: string | null;
  created_at: string;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  status: OrgStatus;
  notes: string | null;
  created_at: string;
  owner_user_id: string | null;
  owner_email: string | null;
  subsidiaries: Subsidiary[];
}

export interface PlatformUser {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  workspace_id: string | null;
  is_email_verified: boolean;
  is_approved: boolean;
  allowed_video_models: string[];
  video_budget_usd: number | null;
  daily_image_limit: number | null;
  daily_video_limit: number | null;
  module_overrides: Record<string, boolean>;
  effective_image_limit: number | null;
  effective_video_limit: number | null;
  images_today: number;
  videos_today: number;
  package_id: string | null;
  package_name: string | null;
  last_login_at: string | null;
  created_at: string;
}

export interface Package {
  id: string;
  name: string;
  description: string | null;
  price_amount: number;
  price_currency: string;
  price_interval: string;
  modules: string[];
  limits: Record<string, number>;
  is_active: boolean;
  is_default: boolean;
  sort_order: number;
  member_count: number;
}

export interface ModuleInfo {
  key: string;
  label: string;
}

export interface PackageList {
  items: Package[];
  modules: ModuleInfo[];
}

export type PackageInput = {
  name: string;
  description?: string;
  price_amount?: number;
  price_currency?: string;
  price_interval?: string;
  modules?: string[];
  limits?: Record<string, number>;
  is_active?: boolean;
  is_default?: boolean;
  sort_order?: number;
};

export interface TelephonyConfig {
  workspace_id: string;
  provider: string; // simulated | cloudone
  is_active: boolean;
  pbx_base_url: string | null;
  api_client_id: string | null;
  api_client_secret_set: boolean;
  sip_domain: string | null;
  sip_ws_url: string | null;
  outbound_caller_id: string | null;
  record_calls: boolean;
  webhook_secret: string | null;
  webhook_url: string | null;
}

export type TelephonyConfigInput = Partial<{
  provider: string;
  is_active: boolean;
  pbx_base_url: string | null;
  api_client_id: string | null;
  api_client_secret: string; // write-only; "" clears
  sip_domain: string | null;
  sip_ws_url: string | null;
  outbound_caller_id: string | null;
  record_calls: boolean;
}>;

export interface AnnouncementAudience {
  user_ids?: string[];
  package_id?: string;
  status?: string;
  approval?: "approved" | "pending";
  verified?: boolean;
}

export interface AnnouncementPreview {
  count: number;
  audience: string;
  sample: string[];
}

export interface AnnouncementRow {
  id: string;
  subject: string;
  audience: string | null;
  total: number;
  sent: number;
  failed: number;
  created_at: string;
  errors: string[];
}

export interface VideoModelInfo {
  key: string;
  label: string;
  description: string;
  max_resolution: string;
  price_per_second: Record<string, number | null>;
  supports_audio: boolean;
}

export interface VideoUsageRow {
  user_id: string;
  name: string;
  email: string;
  jobs_count: number;
  seconds_generated: number;
  spend_usd: number;
  budget_usd: number | null;
  allowed_video_models: string[];
}

export interface PlatformUserList {
  items: PlatformUser[];
  total: number;
  limit: number;
  offset: number;
}

export interface UserUsageSummary {
  user_id: string;
  leads: number;
  customers: number;
  posts_published: number;
  broadcasts_sent: number;
  automations: number;
  connected_accounts: number;
  video_jobs: number;
  video_seconds_generated: number;
  video_spend_usd: number;
  last_login_at: string | null;
  member_since: string;
}

export interface ActivityRow {
  id: string;
  user_id: string | null;
  user_email: string | null;
  workspace_id: string | null;
  method: string;
  path: string;
  action: string | null;
  status_code: number | null;
  duration_ms: number | null;
  ip_address: string | null;
  created_at: string;
}

export interface ActivityLogList {
  items: ActivityRow[];
  total: number;
  limit: number;
  offset: number;
}

export interface PlatformOverview {
  organizations: number;
  subsidiaries: number;
  users: number;
  active_users_7d: number;
  requests_today: number;
  requests_7d: number;
  video_jobs_total: number;
  video_spend_usd_total: number;
}

// -------------------------------------------------------------------- api
export const adminApi = {
  login: (email: string, password: string) =>
    request<AdminTokenResponse>("POST", "/admin/auth/login", { email, password }),
  me: () => request<AdminInfo>("GET", "/admin/auth/me"),
  overview: () => request<PlatformOverview>("GET", "/admin/overview"),

  listOrganizations: () => request<Organization[]>("GET", "/admin/organizations"),
  createOrganization: (body: { name: string; slug: string; notes?: string; owner_user_id?: string }) =>
    request<Organization>("POST", "/admin/organizations", body),
  updateOrganization: (
    id: string,
    body: Partial<{ name: string; status: OrgStatus; notes: string; owner_user_id: string | null }>,
  ) => request<Organization>("PATCH", `/admin/organizations/${id}`, body),
  deleteOrganization: (id: string) => request<void>("DELETE", `/admin/organizations/${id}`),

  createSubsidiary: (body: {
    organization_id: string;
    name: string;
    subdomain: string;
    workspace_id: string;
    notes?: string;
  }) => request<Subsidiary>("POST", "/admin/subsidiaries", body),
  updateSubsidiary: (
    id: string,
    body: Partial<{ name: string; status: SubStatus; workspace_id: string | null; notes: string }>,
  ) => request<Subsidiary>("PATCH", `/admin/subsidiaries/${id}`, body),
  deleteSubsidiary: (id: string) => request<void>("DELETE", `/admin/subsidiaries/${id}`),

  listUsers: (
    filters: { search?: string; role?: string; status?: string; approval?: string; limit?: number; offset?: number } = {},
  ) => request<PlatformUserList>("GET", `/admin/users${qs({ ...filters })}`),
  getUser: (id: string) => request<PlatformUser>("GET", `/admin/users/${id}`),
  updateUser: (
    id: string,
    body: Partial<{
      role: string;
      status: string;
      is_approved: boolean;
      allowed_video_models: string[];
      video_budget_usd: number | null;
      daily_image_limit: number | null;
      daily_video_limit: number | null;
      module_overrides: Record<string, boolean>;
      package_id: string | null;
    }>,
  ) => request<PlatformUser>("PATCH", `/admin/users/${id}`, body),
  approveUser: (id: string) => request<PlatformUser>("POST", `/admin/users/${id}/approve`),
  userUsage: (id: string) => request<UserUsageSummary>("GET", `/admin/users/${id}/usage`),

  listPackages: () => request<PackageList>("GET", "/admin/packages"),
  createPackage: (body: PackageInput) => request<Package>("POST", "/admin/packages", body),
  updatePackage: (id: string, body: Partial<PackageInput>) =>
    request<Package>("PATCH", `/admin/packages/${id}`, body),
  deletePackage: (id: string) => request<void>("DELETE", `/admin/packages/${id}`),

  listAnnouncements: () => request<AnnouncementRow[]>("GET", "/admin/announcements"),
  previewAnnouncement: (body: { subject: string; body: string; audience: AnnouncementAudience }) =>
    request<AnnouncementPreview>("POST", "/admin/announcements/preview", body),
  sendAnnouncement: (body: { subject: string; body: string; audience: AnnouncementAudience }) =>
    request<AnnouncementRow>("POST", "/admin/announcements", body),

  getTelephony: (workspaceId: string) =>
    request<TelephonyConfig>("GET", `/admin/telephony/${workspaceId}`),
  updateTelephony: (workspaceId: string, body: TelephonyConfigInput) =>
    request<TelephonyConfig>("PUT", `/admin/telephony/${workspaceId}`, body),

  videoModels: () => request<VideoModelInfo[]>("GET", "/admin/video-models"),
  videoUsage: () => request<{ items: VideoUsageRow[] }>("GET", "/admin/video-usage"),

  listActivity: (
    filters: { user_id?: string; workspace_id?: string; action?: string; limit?: number; offset?: number } = {},
  ) => request<ActivityLogList>("GET", `/admin/activity${qs({ ...filters })}`),
};
