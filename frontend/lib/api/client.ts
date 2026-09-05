const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

export const apiClient = {
  get: async (endpoint: string, token?: string) => {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    const response = await fetch(`${API_URL}${endpoint}`, {
      method: "GET",
      headers,
    });
    return response.json();
  },

  post: async (endpoint: string, data: any, token?: string) => {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    const response = await fetch(`${API_URL}${endpoint}`, {
      method: "POST",
      headers,
      body: JSON.stringify(data),
    });
    return response.json();
  },

  put: async (endpoint: string, data: any, token?: string) => {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    const response = await fetch(`${API_URL}${endpoint}`, {
      method: "PUT",
      headers,
      body: JSON.stringify(data),
    });
    return response.json();
  },

  delete: async (endpoint: string, token?: string) => {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    const response = await fetch(`${API_URL}${endpoint}`, {
      method: "DELETE",
      headers,
    });
    return response.json();
  },
};