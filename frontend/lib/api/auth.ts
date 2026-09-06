import { http, resetSessionGuards } from "./http";

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

/** Auth calls go through the shared `http` client, so a failed request always
 * throws `ApiError` with the server's `detail` — no response is ever read as
 * if it had succeeded. */
export const auth = {
  register: async (data: RegisterData): Promise<AuthResponse> => {
    const res = await http.post<AuthResponse>("/auth/register", data);
    resetSessionGuards();
    return res;
  },

  login: async (data: LoginData): Promise<AuthResponse> => {
    const res = await http.post<AuthResponse>("/auth/login", data);
    resetSessionGuards();
    return res;
  },

  logout: (): Promise<void> => http.post<void>("/auth/logout", {}),

  forgotPassword: (email: string): Promise<{ message: string }> =>
    http.post("/auth/forgot-password", { email }),

  resetPassword: (
    token: string,
    new_password: string,
  ): Promise<{ message: string }> =>
    http.post("/auth/reset-password", {
      token,
      new_password,
      new_password_confirm: new_password,
    }),

  verifyEmail: (token: string): Promise<{ message: string }> =>
    http.post("/auth/verify-email", { token }),

  resendVerification: (): Promise<{ message: string }> =>
    http.post("/auth/resend-verification", {}),
};
