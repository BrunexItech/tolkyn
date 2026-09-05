import { http } from "./http";

export type TeamRole = "owner" | "admin" | "editor" | "analyst" | "viewer";
export type MemberStatus = "active" | "invited" | "suspended";

export interface TeamMember {
  id: string;
  email: string;
  name: string | null;
  title: string | null;
  avatar_color: string | null;
  role: TeamRole;
  status: MemberStatus;
  permissions: string[];
  invited_at: string | null;
  joined_at: string | null;
  last_active_at: string | null;
  workspace_id: string;
  created_at: string;
}

export interface RoleInfo {
  id: TeamRole;
  label: string;
  permissions: string[];
}

export interface TeamSummary {
  total: number;
  active: number;
  pending: number;
  by_role: Record<string, number>;
  roles: RoleInfo[];
}

export interface InviteInput {
  email: string;
  name?: string;
  title?: string;
  role: TeamRole;
}

export interface MemberUpdate {
  name?: string;
  title?: string;
  role?: TeamRole;
  status?: MemberStatus;
}

/** invite_link is non-null only when the workspace hasn't configured real
 * outbound email — show it as a copyable fallback rather than claiming an
 * email went out. */
export interface InviteResult {
  member: TeamMember;
  invite_link: string | null;
}

export interface MyRole {
  user_id: string;
  workspace_id: string;
  role: TeamRole;
  permissions: string[];
  features: string[]; // platform modules the workspace's package grants; ["*"] = all
  is_owner: boolean;
}

export interface InvitePreview {
  email: string;
  role: TeamRole;
  workspace_name: string;
  inviter_name: string | null;
}

export const teamApi = {
  list: () => http.get<{ items: TeamMember[] }>("/team"),
  summary: () => http.get<TeamSummary>("/team/summary"),
  me: () => http.get<MyRole>("/team/me"),
  invite: (body: InviteInput) => http.post<InviteResult>("/team", body),
  update: (id: string, body: MemberUpdate) => http.patch<TeamMember>(`/team/${id}`, body),
  resend: (id: string) => http.post<InviteResult>(`/team/${id}/resend`),
  remove: (id: string) => http.del<void>(`/team/${id}`),

  // Invite acceptance — public, pre-auth
  previewInvite: (token: string) => http.get<InvitePreview>(`/team/invite/${token}`),
  acceptInvite: (token: string, body: { name?: string; password: string; password_confirm: string }) =>
    http.post<{
      user: { id: string; name: string; email: string; role: string; status: string; created_at: string };
      token: { access_token: string; refresh_token: string; token_type: string; expires_in: number };
    }>(`/team/invite/${token}/accept`, body),
};
