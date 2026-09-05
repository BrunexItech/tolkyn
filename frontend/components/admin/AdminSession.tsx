"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { adminApi, type AdminInfo } from "@/lib/api/admin";

interface AdminSessionValue {
  admin: AdminInfo | null;
  loading: boolean;
  logout: () => void;
}

const AdminSessionContext = createContext<AdminSessionValue | null>(null);

export function AdminSessionProvider({ children }: { children: ReactNode }) {
  const [admin, setAdmin] = useState<AdminInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const logout = () => {
    localStorage.removeItem("admin_access_token");
    document.cookie = "admin_access_token=; path=/; max-age=0";
    setAdmin(null);
    router.push("/admin/login");
  };

  useEffect(() => {
    adminApi
      .me()
      .then(setAdmin)
      .catch(logout)
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <AdminSessionContext.Provider value={{ admin, loading, logout }}>
      {children}
    </AdminSessionContext.Provider>
  );
}

export function useAdminSession(): AdminSessionValue {
  const ctx = useContext(AdminSessionContext);
  if (!ctx) throw new Error("useAdminSession must be used within AdminSessionProvider");
  return ctx;
}
