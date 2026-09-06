import { apiClient } from "./client";

export interface RegisterData {
  name: string;
  email: string;
  password: string;
  password_confirm: string;
}

export interface LoginData {
  email: string;
  password: string;
  remember_me?: boolean;
}

export interface AuthResponse {
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
    status: string;
    created_at: string;
  };
  token: {
    access_token: string;
    refresh_token: string;
    token_type: string;
    expires_in: number;
  };
}

export const auth = {
  register: async (data: RegisterData): Promise<AuthResponse> => {
    const response = await apiClient.post("/auth/register", data);
    if (response?.detail) throw new Error(pickDetail(response.detail));
    if (response?.error) throw new Error(response.error);
    return response;
  },

  login: async (data: LoginData): Promise<AuthResponse> => {
    const response = await apiClient.post("/auth/login", data);
    if (response?.detail) throw new Error(pickDetail(response.detail));
    if (response?.error) throw new Error(response.error);
    return response;
  },

  getMe: async (token: string): Promise<any> => {
    const response = await apiClient.get("/auth/me", token);
    if (response?.detail) throw new Error(pickDetail(response.detail));
    if (response?.error) throw new Error(response.error);
    return response;
  },

  logout: async (token: string): Promise<void> => {
    await apiClient.post("/auth/logout", {}, token);
  },

  forgotPassword: async (email: string): Promise<{ message: string }> => {
    const res = await apiClient.post("/auth/forgot-password", { email });
    if (res.detail) throw new Error(pickDetail(res.detail));
    return res;
  },

  resetPassword: async (
    token: string,
    new_password: string,
  ): Promise<{ message: string }> => {
    const res = await apiClient.post("/auth/reset-password", {
      token,
      new_password,
      new_password_confirm: new_password,
    });
    if (res.detail) throw new Error(pickDetail(res.detail));
    return res;
  },

  verifyEmail: async (token: string): Promise<{ message: string }> => {
    const res = await apiClient.post("/auth/verify-email", { token });
    if (res.detail) throw new Error(pickDetail(res.detail));
    return res;
  },

  resendVerification: async (token: string): Promise<{ message: string }> => {
    const res = await apiClient.post("/auth/resend-verification", {}, token);
    if (res.detail) throw new Error(pickDetail(res.detail));
    return res;
  },
};

function pickDetail(detail: unknown): string {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    const first = detail[0] as { msg?: string } | undefined;
    return first?.msg || "Request failed";
  }
  return "Request failed";
}