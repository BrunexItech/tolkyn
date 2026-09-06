"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { BrandLoader } from "./BrandLoader";
import { NavProgress } from "./NavProgress";
import { useSession } from "@/components/om/session";

interface MobileNavCtx {
  open: boolean;
  toggle: () => void;
  close: () => void;
}
const MobileNav = createContext<MobileNavCtx>({ open: false, toggle: () => {}, close: () => {} });
export const useMobileNav = () => useContext(MobileNav);

/** App layout: sidebar + main column with internal scroll. On large screens
 * the sidebar is a fixed rail; below `lg` it collapses to an off-canvas
 * drawer toggled from the top bar. Holds the branded loader up until the
 * session has hydrated so the first dashboard paint is never a blank flash.
 * The sidebar and top bar stay mounted across route changes — only <main>
 * swaps — so moving between pages is a content fade, not a full reload. */
export function AppShell({ children }: { children: ReactNode }) {
  const { hydrated } = useSession();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const close = useCallback(() => setOpen(false), []);
  const toggle = useCallback(() => setOpen((o) => !o), []);

  // Close the drawer whenever the route changes.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Lock body scroll while the drawer is open on mobile.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!hydrated) return <BrandLoader />;

  return (
    <MobileNav.Provider value={{ open, toggle, close }}>
      <NavProgress>
        <div className="om-app relative z-10 flex h-screen overflow-hidden">
          {/* backdrop — mobile only, when the drawer is open */}
          {open && (
            <button
              aria-label="Close menu"
              onClick={close}
              className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden"
            />
          )}

          {/* sidebar: static rail ≥ lg, off-canvas drawer below */}
          <div
            className={cnDrawer(open)}
          >
            <Sidebar />
          </div>

          <div className="flex flex-1 flex-col overflow-hidden">
            <TopBar />
            <main className="om-scroll flex-1 overflow-y-auto px-4 py-3.5">{children}</main>
          </div>
        </div>
      </NavProgress>
    </MobileNav.Provider>
  );
}

function cnDrawer(open: boolean): string {
  return [
    "z-50 flex h-full shrink-0 transition-transform duration-200 ease-out",
    "max-lg:fixed max-lg:inset-y-0 max-lg:left-0 max-lg:shadow-2xl",
    open ? "max-lg:translate-x-0" : "max-lg:-translate-x-full",
  ].join(" ");
}
