import { http } from "./http";

export interface Me {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  is_approved: boolean;
  is_email_verified?: boolean;
  terms_accepted: boolean;
  terms_version: string | null;
  workspace_id: string | null;
  phone?: string | null;
  position?: string | null;
  location?: string | null;
  website?: string | null;
  timezone: string;
  language: string;
  created_at: string;
}

export interface ProfileUpdate {
  name?: string;
  phone?: string;
  position?: string;
  location?: string;
  website?: string;
  timezone?: string;
  language?: string;
}

export interface PasswordChange {
  current_password: string;
  new_password: string;
  new_password_confirm: string;
}

export const accountApi = {
  me: () => http.get<Me>("/auth/me"),
  acceptTerms: () => http.post<Me>("/auth/accept-terms", {}),
  updateProfile: (data: ProfileUpdate) => http.put<Me>("/auth/me", data),
  changePassword: (data: PasswordChange) =>
    http.post<{ message: string }>("/auth/change-password", data),
};
