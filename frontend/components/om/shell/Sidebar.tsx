"use client";

import { useEffect } from "react";
import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { Loader2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { NAV } from "./nav";
import { BrandLockup } from "./Brand";
import { useNavProgress } from "./NavProgress";
import { useSession } from "@/components/om/session";
import { useQuery } from "@tanstack/react-query";
import { PLATFORMS } from "@/lib/om/platforms";
import { inboxApi } from "@/lib/api/inbox";
import { callCenterApi } from "@/lib/api/callcenter";
import { socialLeadsApi } from "@/lib/api/socialLeads";
import { postsApi } from "@/lib/api/posts";
import { LiveDot } from "@/components/om/primitives/Pill";
import { useMyRole } from "@/components/team/hooks";

/** Inner content of a sidebar link. Lives under <Link>, so it can read that
 * link's pending state: swaps the icon for a spinner and drives the top
 * progress bar while the destination loads. */
function SidebarLinkBody({
  label,
  Icon,
  active,
  badge,
}: {
  label: string;
  Icon: LucideIcon;
  active: boolean;
  badge: number;
}) {
  const { pending } = useLinkStatus();
  const { begin, end } = useNavProgress();

  useEffect(() => {
    if (!pending) return;
    begin();
    return () => end();
  }, [pending, begin, end]);

  return (
    <>
      {active && (
        <span className="absolute left-0 top-1/2 h-4 w-[2.5px] -translate-y-1/2 rounded-r bg-om-blue" />
      )}
      {pending ? (
        <Loader2 className="size-4 shrink-0 animate-spin text-om-blue" />
      ) : (
        <Icon
          className={cn(
            "size-4 shrink-0",
            active ? "text-om-blue" : "text-om-faint group-hover:text-om-dim",
          )}
        />
      )}
      <span className="truncate">{label}</span>
      {badge > 0 && (
        <span className="ml-auto rounded-full bg-om-blue/15 px-1.5 py-px text-[9.5px] font-bold text-om-blue">
          {badge}
        </span>
      )}
    </>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const { user, workspace, connections, connectedPlatforms } = useSession();
  const { data: myRole } = useMyRole();
  // Fail open: until /team/me resolves (or for the overwhelming majority of
  // accounts with no team at all), show everything — only actively hide once
  // we know for certain this login lacks the permission.
  const hasPerm = (permKey?: string) =>
    !permKey || !myRole || myRole.is_owner || myRole.permissions.includes("*") || myRole.permissions.includes(permKey);
  // Plan/package gate — hide sections the workspace's package doesn't include.
  // Fail open until /team/me resolves. `["*"]` (or no package) = everything.
  const hasModule = (moduleKey?: string) =>
    !moduleKey ||
    !myRole ||
    !Array.isArray(myRole.features) ||
    myRole.features.includes("*") ||
    myRole.features.includes(moduleKey);
  const { data: inboxSummary } = useQuery({
    queryKey: ["inbox", "summary"],
    queryFn: inboxApi.summary,
    staleTime: 30_000,
  });
  const { data: callPoll } = useQuery({
    queryKey: ["call-center", "poll"],
    queryFn: callCenterApi.poll,
    staleTime: 15_000,
    refetchInterval: 20_000,
  });
  const { data: socialLeadSummary } = useQuery({
    queryKey: ["social-leads", "summary"],
    queryFn: socialLeadsApi.summary,
    staleTime: 30_000,
  });
  const { data: postsSummary } = useQuery({
    queryKey: ["posts", "summary"],
    queryFn: postsApi.summary,
    staleTime: 30_000,
  });

  const badges: Record<string, number> = {
    inbox: inboxSummary?.unread ?? 0,
    calls: callPoll?.queue.length ?? 0,
    calendar: 0,
    accounts: connectedPlatforms.length,
    crm: socialLeadSummary?.new ?? 0,
    published: (postsSummary?.failed ?? 0) + (postsSummary?.partial ?? 0),
  };

  return (
    <nav className="flex w-[224px] shrink-0 flex-col overflow-hidden border-r border-om-border bg-sidebar">
      {/* brand */}
      <div className="flex h-[46px] items-center border-b border-om-border px-3.5">
        <BrandLockup compact />
      </div>

      {/* user card */}
      <div className="mx-2.5 mt-2.5 flex items-center gap-2 rounded-lg border border-om-border bg-white/[0.02] px-2.5 py-2">
        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-gradient-to-br from-om-blue to-om-violet text-[10.5px] font-bold text-white">
          {user.initials}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[11.5px] font-semibold">{user.name}</span>
          <span className="block truncate text-[9.5px] text-om-muted">
            {workspace.name} · {workspace.plan}
          </span>
        </span>
      </div>

      {/* nav */}
      <div className="om-scroll-none mt-1 flex-1 overflow-y-auto px-2 py-1.5">
        {NAV.map((section) => {
          const items = section.items.filter((it) => hasPerm(it.permKey) && hasModule(it.moduleKey));
          if (!items.length) return null;
          return (
          <div key={section.title} className="mb-1">
            <div className="px-2 pb-1 pt-2.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-om-faint">
              {section.title}
            </div>
            {items.map((it) => {
              const active =
                pathname === it.href ||
                (it.href !== "/dashboard" && pathname.startsWith(it.href));
              const badge = it.badgeKey ? badges[it.badgeKey] : 0;
              return (
                <Link
                  key={it.href}
                  href={it.href}
                  className={cn(
                    "group relative flex items-center gap-2.5 rounded-lg px-2 py-[7px] text-[12px] font-medium transition-colors",
                    active
                      ? "bg-om-blue/12 text-om-blue"
                      : "text-om-muted hover:bg-white/[0.04] hover:text-om-text",
                  )}
                >
                  <SidebarLinkBody label={it.label} Icon={it.icon} active={active} badge={badge} />
                </Link>
              );
            })}
          </div>
          );
        })}
      </div>

      {/* connected accounts */}
      <div className="border-t border-om-border px-3 py-2.5">
        <Link
          href="/dashboard/accounts"
          className="mb-1.5 flex items-center gap-1 text-[9px] font-semibold uppercase tracking-[0.1em] text-om-faint hover:text-om-muted"
        >
          <LiveDot className={connectedPlatforms.length ? "bg-om-green" : "bg-om-faint"} />
          {connectedPlatforms.length} Connected
        </Link>
        <div className="flex flex-wrap gap-1">
          {PLATFORMS.map((p) => {
            const { Icon } = p;
            const on = connections[p.id];
            return (
              <span
                key={p.id}
                title={p.name}
                className={cn(
                  "grid size-6 place-items-center rounded-md border transition-opacity",
                  on ? "border-om-green/50 opacity-100" : "border-transparent opacity-40",
                )}
                style={{ background: `${p.color}1f` }}
              >
                <Icon className="size-3" style={{ color: p.color }} />
              </span>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
