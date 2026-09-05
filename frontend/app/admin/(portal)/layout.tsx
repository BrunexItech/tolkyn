"use client";

import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { AdminSessionProvider, useAdminSession } from "@/components/admin/AdminSession";
import { AdminShell } from "@/components/admin/AdminShell";

function Gate({ children }: { children: ReactNode }) {
  const { admin, loading } = useAdminSession();

  if (loading) {
    return (
      <div className="grid h-screen place-items-center bg-background text-om-muted">
        <Loader2 className="size-5 animate-spin" />
      </div>
    );
  }
  if (!admin) return null; // AdminSessionProvider is already redirecting to /admin/login

  return <AdminShell>{children}</AdminShell>;
}

export default function AdminPortalLayout({ children }: { children: ReactNode }) {
  return (
    <AdminSessionProvider>
      <Gate>{children}</Gate>
    </AdminSessionProvider>
  );
}
