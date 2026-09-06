"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Search, Bell, ChevronDown, LogOut, User, Settings as SettingsIcon, PlugZap, Inbox as InboxIcon, Menu } from "lucide-react";
import { PAGE_TITLES } from "./nav";
import { SearchPalette } from "./SearchPalette";
import { useMobileNav } from "./AppShell";
import { useSession } from "@/components/om/session";
import { socialApi, SUPPORTED_PLATFORMS } from "@/lib/api/social";
import { inboxApi, type ThreadSummary } from "@/lib/api/inbox";
import { platform as findPlatform } from "@/lib/om/platforms";
import { PlatformGlyph } from "@/components/om/primitives/PlatformChip";
import { OmButton } from "@/components/om/primitives/OmButton";
import { EmptyState } from "@/components/om/primitives/EmptyState";
import { relativeTime, truncate } from "@/lib/om/format";
import { toast } from "@/lib/om/toast";
import { cn } from "@/lib/utils";

const MAX_NOTIFICATIONS = 8;

export function TopBar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, connectedPlatforms } = useSession();
  const [menuOpen, setMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);

  const { toggle: toggleNav } = useMobileNav();
  const meta = PAGE_TITLES[pathname] ?? { title: "Dashboard" };
  const allConnected = connectedPlatforms.length >= SUPPORTED_PLATFORMS.length;

  // Same queryKey the sidebar badge uses — one shared cache entry, so this
  // doesn't double the polling. Covers WhatsApp messages and social comments
  // alike since both land in the same InboxThread table.
  const { data: inboxSummary } = useQuery({
    queryKey: ["inbox", "summary"],
    queryFn: inboxApi.summary,
    staleTime: 15_000,
    refetchInterval: 20_000,
  });
  const { data: threadsData } = useQuery({
    queryKey: ["inbox", "list", {}],
    queryFn: () => inboxApi.list({}),
    staleTime: 15_000,
    refetchInterval: 20_000,
  });
  const unread = inboxSummary?.unread ?? 0;
  const recent: ThreadSummary[] = (threadsData?.items ?? [])
    .filter((t) => t.unread > 0)
    .sort((a, b) => (b.last_message_at || "").localeCompare(a.last_message_at || ""))
    .slice(0, MAX_NOTIFICATIONS);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false);
    };
    if (menuOpen || notifOpen) document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [menuOpen, notifOpen]);

  // ⌘K / Ctrl+K anywhere, or "/" when not typing in a field, opens search.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      const typing =
        e.target instanceof HTMLElement &&
        (e.target.tagName === "INPUT" ||
          e.target.tagName === "TEXTAREA" ||
          e.target.isContentEditable);
      if ((e.metaKey || e.ctrlKey) && k === "k") {
        e.preventDefault();
        setSearchOpen(true);
      } else if (k === "/" && !typing && !searchOpen) {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [searchOpen]);

  const openThread = (id: string) => {
    setNotifOpen(false);
    router.push(`/dashboard/inbox?thread=${id}`);
  };

  const connectAll = async () => {
    try {
      const { url } = await socialApi.connectPage();
      if (url) window.location.assign(url);
    } catch (e) {
      toast.err((e as Error).message);
    }
  };

  const logout = () => {
    ["access_token", "refresh_token", "user"].forEach((k) => localStorage.removeItem(k));
    document.cookie = "access_token=; path=/; max-age=0";
    document.cookie = "refresh_token=; path=/; max-age=0";
    toast.ok("Signed out");
    router.push("/");
    router.refresh();
  };

  return (
    <header className="flex h-[46px] shrink-0 items-center gap-3 border-b border-om-border bg-sidebar px-3.5">
      <button
        onClick={toggleNav}
        className="-ml-1 grid size-8 shrink-0 place-items-center rounded-lg text-om-muted transition-colors hover:bg-white/[0.05] hover:text-om-text lg:hidden"
        aria-label="Open menu"
      >
        <Menu className="size-[18px]" />
      </button>

      <div className="min-w-0">
        <div className="truncate text-[13px] font-semibold tracking-tight">{meta.title}</div>
        {meta.subtitle && (
          <div className="truncate text-[10px] text-om-muted">{meta.subtitle}</div>
        )}
      </div>

      <button
        onClick={() => setSearchOpen(true)}
        className="ml-auto grid size-8 place-items-center rounded-lg text-om-muted transition-colors hover:bg-white/[0.05] hover:text-om-text md:hidden"
        aria-label="Search"
      >
        <Search className="size-4" />
      </button>

      <button
        onClick={() => setSearchOpen(true)}
        className="group hidden items-center gap-2 rounded-lg border border-om-border bg-white/[0.03] py-1.5 pl-2.5 pr-2 text-[12px] text-om-muted transition-colors hover:border-om-blue/50 hover:text-om-dim md:ml-auto md:flex"
        aria-label="Search"
      >
        <Search className="size-3.5" />
        <span className="w-32 text-left">Search…</span>
        <kbd className="rounded border border-om-border px-1.5 py-px text-[10px] text-om-faint">
          ⌘K
        </kbd>
      </button>

      {!allConnected && (
        <OmButton variant="subtle" size="sm" onClick={connectAll} className="hidden sm:inline-flex">
          <PlugZap /> Connect accounts
        </OmButton>
      )}

      <div className="relative" ref={notifRef}>
        <button
          onClick={() => setNotifOpen((o) => !o)}
          className="relative grid size-8 place-items-center rounded-lg text-om-muted transition-colors hover:bg-white/[0.05] hover:text-om-text"
          aria-label="Notifications"
        >
          <Bell className="size-4" />
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 grid min-w-[15px] place-items-center rounded-full bg-om-red px-[3px] text-[9px] font-bold leading-[15px] text-white">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </button>
        {notifOpen && (
          <div className="absolute right-0 z-50 mt-1.5 w-80 overflow-hidden rounded-xl border border-om-border bg-om-bg2 shadow-2xl">
            <div className="flex items-center justify-between border-b border-om-border px-3 py-2.5">
              <span className="text-[12px] font-semibold">Notifications</span>
              {unread > 0 && (
                <span className="text-[10.5px] text-om-muted">{unread} unread</span>
              )}
            </div>
            <div className="om-scroll max-h-80 overflow-y-auto">
              {recent.length === 0 ? (
                <EmptyState icon={<InboxIcon />} title="You're all caught up" className="py-6" />
              ) : (
                recent.map((t) => {
                  const p = findPlatform(t.platform);
                  return (
                    <button
                      key={t.id}
                      onClick={() => openThread(t.id)}
                      className="flex w-full items-start gap-2.5 border-b border-om-border/60 px-3 py-2.5 text-left transition-colors last:border-b-0 hover:bg-white/[0.04]"
                    >
                      {p ? (
                        <PlatformGlyph platform={p} size={26} />
                      ) : (
                        <span className="grid size-[26px] shrink-0 place-items-center rounded-lg bg-white/[0.05] text-om-faint">
                          <InboxIcon className="size-3.5" />
                        </span>
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          <span className="truncate text-[12px] font-medium text-om-text">{t.author_name}</span>
                          <span className="ml-auto shrink-0 text-[9.5px] text-om-faint">
                            {t.last_message_at ? relativeTime(t.last_message_at) : ""}
                          </span>
                        </span>
                        <span className="mt-0.5 block truncate text-[11px] text-om-dim">
                          {truncate(t.preview || "New message", 64)}
                        </span>
                      </span>
                      <span className="mt-1 size-1.5 shrink-0 rounded-full bg-om-blue" />
                    </button>
                  );
                })
              )}
            </div>
            <Link
              href="/dashboard/inbox"
              onClick={() => setNotifOpen(false)}
              className="block border-t border-om-border px-3 py-2 text-center text-[11px] font-medium text-om-blue hover:bg-white/[0.04]"
            >
              View all in Inbox
            </Link>
          </div>
        )}
      </div>

      <div className="relative" ref={menuRef}>
        <button
          onClick={() => setMenuOpen((o) => !o)}
          className="flex items-center gap-1.5 rounded-lg py-1 pl-1 pr-2 transition-colors hover:bg-white/[0.05]"
        >
          <span className="grid size-7 place-items-center rounded-full bg-gradient-to-br from-om-blue to-om-violet text-[10px] font-bold text-white">
            {user.initials}
          </span>
          <ChevronDown className="size-3.5 text-om-muted" />
        </button>
        {menuOpen && (
          <div className="absolute right-0 z-50 mt-1.5 w-52 overflow-hidden rounded-xl border border-om-border bg-om-bg2 py-1 shadow-2xl">
            <div className="border-b border-om-border px-3 py-2">
              <div className="truncate text-[12px] font-semibold">{user.name}</div>
              <div className="truncate text-[10.5px] text-om-muted">{user.email || "—"}</div>
            </div>
            <MenuLink href="/dashboard/settings" icon={<User className="size-3.5" />}>
              Profile
            </MenuLink>
            <MenuLink href="/dashboard/settings" icon={<SettingsIcon className="size-3.5" />}>
              Settings
            </MenuLink>
            <button
              onClick={logout}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-[12px] text-om-red transition-colors hover:bg-om-red/10"
            >
              <LogOut className="size-3.5" />
              Sign out
            </button>
          </div>
        )}
      </div>

      <SearchPalette open={searchOpen} onClose={() => setSearchOpen(false)} />
    </header>
  );
}

function MenuLink({
  href,
  icon,
  children,
}: {
  href: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-2 px-3 py-1.5 text-[12px] text-om-dim transition-colors hover:bg-white/[0.05] hover:text-om-text",
      )}
    >
      {icon}
      {children}
    </Link>
  );
}
