"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Building2, Users, Activity, ShieldAlert, LogOut, Clapperboard, Package, Phone, Megaphone } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAdminSession } from "./AdminSession";

const NAV = [
  { label: "Overview", href: "/admin", icon: LayoutDashboard },
  { label: "Organizations", href: "/admin/organizations", icon: Building2 },
  { label: "Users & Rights", href: "/admin/users", icon: Users },
  { label: "Packages", href: "/admin/packages", icon: Package },
  { label: "Telephony", href: "/admin/telephony", icon: Phone },
  { label: "AI Video", href: "/admin/video", icon: Clapperboard },
  { label: "Announcements", href: "/admin/announcements", icon: Megaphone },
  { label: "Activity", href: "/admin/activity", icon: Activity },
];

export function AdminSidebar() {
  const pathname = usePathname();
  const { admin, logout } = useAdminSession();

  return (
    <nav className="flex w-[60px] shrink-0 flex-col overflow-hidden border-r border-om-border bg-sidebar lg:w-[224px]">
      <div className="flex h-[46px] items-center gap-2 border-b border-om-border px-3 lg:px-3.5">
        <span className="grid size-6 shrink-0 place-items-center rounded-md bg-om-violet/15 text-om-violet">
          <ShieldAlert className="size-3.5" />
        </span>
        <div className="hidden min-w-0 leading-tight lg:block">
          <div className="truncate text-[12px] font-bold tracking-tight">Tolkyn</div>
          <div className="truncate text-[8.5px] font-semibold uppercase tracking-[0.14em] text-om-violet">
            Platform Control
          </div>
        </div>
      </div>

      {admin && (
        <div className="mx-2 mt-2.5 flex items-center gap-2 rounded-lg border border-om-border bg-white/[0.02] p-1.5 lg:mx-2.5 lg:px-2.5 lg:py-2">
          <span className="grid size-7 shrink-0 place-items-center rounded-full bg-gradient-to-br from-om-violet to-om-red text-[10.5px] font-bold text-white">
            {admin.name.slice(0, 1).toUpperCase()}
          </span>
          <span className="hidden min-w-0 flex-1 lg:block">
            <span className="block truncate text-[11.5px] font-semibold">{admin.name}</span>
            <span className="block truncate text-[9.5px] text-om-muted">{admin.email}</span>
          </span>
        </div>
      )}

      <div className="mt-2 flex-1 overflow-y-auto px-2 py-1.5">
        {NAV.map((it) => {
          const active = pathname === it.href;
          const Icon = it.icon;
          return (
            <Link
              key={it.href}
              href={it.href}
              title={it.label}
              className={cn(
                "mb-0.5 flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[12px] font-medium transition-colors max-lg:justify-center",
                active
                  ? "bg-om-violet/12 text-om-violet"
                  : "text-om-dim hover:bg-white/[0.04] hover:text-om-text",
              )}
            >
              <Icon className="size-4 shrink-0" />
              <span className="hidden lg:inline">{it.label}</span>
            </Link>
          );
        })}
      </div>

      <div className="border-t border-om-border p-2">
        <button
          onClick={logout}
          title="Log out"
          className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[12px] font-medium text-om-muted transition-colors hover:bg-om-red/10 hover:text-om-red max-lg:justify-center"
        >
          <LogOut className="size-4 shrink-0" />
          <span className="hidden lg:inline">Log out</span>
        </button>
      </div>
    </nav>
  );
}
