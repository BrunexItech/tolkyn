import { http } from "./http";

export interface Me {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  is_approved: boolean;
  terms_accepted: boolean;
  terms_version: string | null;
  workspace_id: string | null;
  timezone: string;
  language: string;
  created_at: string;
}

export const accountApi = {
  me: () => http.get<Me>("/auth/me"),
  acceptTerms: () => http.post<Me>("/auth/accept-terms", {}),
};
