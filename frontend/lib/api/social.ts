import { http } from "./http";

export type ConnectionStatus = "connected" | "disconnected" | "error";

/** Platforms Tolkyn can connect + publish to. */
export const SUPPORTED_PLATFORMS = [
  "facebook",
  "instagram",
  "x",
  "linkedin",
  "tiktok",
  "youtube",
] as const;

export interface SocialConnection {
  id: string;
  platform: string;
  status: ConnectionStatus;
  handle: string | null;
  display_name: string | null;
  avatar_url: string | null;
  followers: number | null;
  scopes: string[];
  needs_reauth: boolean;
  connected_at: string | null;
  last_synced_at: string | null;
  last_error: string | null;
  workspace_id: string;
  created_at: string;
  updated_at: string;
}

export interface ConnectionList {
  items: SocialConnection[];
  connected: string[];
  provider: string;
  configured: boolean;
}

export interface ConnectStart {
  authorize_url: string;
  state: string | null;
  expires_in: number | null;
}

export const socialApi = {
  list: () => http.get<ConnectionList>("/accounts"),
  sync: () => http.post<ConnectionList>("/accounts/sync"),
  /** Begin the OAuth flow for one platform — returns the URL to send the browser to. */
  connect: (platform: string) => http.post<ConnectStart>("/accounts/connect", { platform }),
  /** Branded hosted page where the user can connect / remove any channel. */
  connectPage: () => http.get<{ url: string }>("/accounts/connect-page"),
  /** Marks the platform disconnected locally and returns the hosted page URL to finish revoking. */
  disconnect: (platform: string) => http.del<{ url: string }>(`/accounts/${platform}`),
};
