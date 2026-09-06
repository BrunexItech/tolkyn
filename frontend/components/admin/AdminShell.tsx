import type { ReactNode } from "react";
import { AdminSidebar } from "./AdminSidebar";

/** Layout for the super-admin portal — deliberately its own shell, not the
 * tenant AppShell, so the two surfaces can never be mistaken for each other. */
export function AdminShell({ children }: { children: ReactNode }) {
  return (
    <div className="om-app relative z-10 flex h-screen overflow-hidden">
      <AdminSidebar />
      <main className="om-scroll flex-1 overflow-y-auto px-5 py-4">{children}</main>
    </div>
  );
}
