"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Building2, Check, ChevronDown, Loader2 } from "lucide-react";
import { auth } from "@/lib/api/auth";
import { toast } from "@/lib/om/toast";

/** Only ever visible for a "main account" a super admin has linked
 * subsidiaries to (Super Admin -> Organizations) -- for every other
 * account `listWorkspaces` returns just the one (self) entry and this
 * renders nothing at all. */
export function WorkspaceSwitcher() {
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const { data: workspaces } = useQuery({
    queryKey: ["auth", "workspaces"],
    queryFn: auth.listWorkspaces,
    staleTime: 60_000,
  });

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  if (!workspaces || workspaces.length < 2) return null;

  const current = workspaces.find((w) => w.is_current) ?? workspaces[0];

  const switchTo = async (workspaceId: string) => {
    if (workspaceId === current.workspace_id) {
      setOpen(false);
      return;
    }
    setSwitching(true);
    try {
      await auth.activateWorkspace(workspaceId);
      // Every screen in the app is workspace-scoped off the server session,
      // not client state -- a full reload is the simplest way to guarantee
      // nothing from the previous workspace lingers in any cache.
      window.location.reload();
    } catch (e) {
      toast.err((e as Error).message);
      setSwitching(false);
    }
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        disabled={switching}
        className="flex items-center gap-1.5 rounded-lg border border-om-border bg-white/[0.03] py-1 pl-2 pr-1.5 text-[11.5px] text-om-dim transition-colors hover:border-om-blue/40 disabled:opacity-60"
      >
        {switching ? (
          <Loader2 className="size-3.5 animate-spin text-om-muted" />
        ) : (
          <Building2 className="size-3.5 text-om-muted" />
        )}
        <span className="max-w-[140px] truncate">{current.name}</span>
        <ChevronDown className="size-3 text-om-muted" />
      </button>
      {open && (
        <div className="absolute left-0 z-50 mt-1.5 w-60 overflow-hidden rounded-xl border border-om-border bg-om-bg2 py-1 shadow-2xl">
          <div className="border-b border-om-border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-om-faint">
            Switch workspace
          </div>
          {workspaces.map((w) => (
            <button
              key={w.workspace_id}
              onClick={() => switchTo(w.workspace_id)}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] text-om-dim transition-colors hover:bg-white/[0.05] hover:text-om-text"
            >
              <span className="min-w-0 flex-1 truncate">
                {w.name}
                {w.is_self && <span className="ml-1 text-om-faint">(you)</span>}
              </span>
              {w.is_current && <Check className="size-3.5 shrink-0 text-om-green" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
