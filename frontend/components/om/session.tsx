"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PLATFORMS, type Platform, type PlatformId } from "@/lib/om/platforms";
import { socialApi } from "@/lib/api/social";

export interface WorkspaceUser {
  name: string;
  email: string;
  initials: string;
}

export interface Workspace {
  name: string;
  plan: "Starter" | "Growth" | "Enterprise";
}

export interface AppStats {
  published: number;
  scheduled: number;
  replies: number;
  messages: number;
}

const DEFAULT_USER: WorkspaceUser = { name: "Tolkyn User", email: "", initials: "OM" };
const DEFAULT_WORKSPACE: Workspace = { name: "Tolkyn", plan: "Growth" };
const DEFAULT_STATS: AppStats = { published: 0, scheduled: 0, replies: 0, messages: 0 };

interface SessionContextValue {
  user: WorkspaceUser;
  workspace: Workspace;
  connections: Record<string, boolean>;
  connectedPlatforms: Platform[];
  connect: (id: PlatformId) => void;
  disconnect: (id: PlatformId) => void;
  isConnected: (id: PlatformId) => boolean;
  stats: AppStats;
  bumpStats: (patch: Partial<Record<keyof AppStats, number>>) => void;
  hydrated: boolean;
}

const SessionContext = createContext<SessionContextValue | null>(null);

function initialsFrom(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "OM";
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [user, setUser] = useState<WorkspaceUser>(DEFAULT_USER);
  const [workspace] = useState<Workspace>(DEFAULT_WORKSPACE);
  const [stats, setStats] = useState<AppStats>(DEFAULT_STATS);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("user");
      if (raw) {
        const u = JSON.parse(raw);
        const name = u?.name || DEFAULT_USER.name;
        setUser({ name, email: u?.email || "", initials: initialsFrom(name) });
      }
    } catch {
      /* ignore */
    }
    setHydrated(true);
  }, []);

  const { data: connData } = useQuery({
    queryKey: ["accounts"],
    queryFn: socialApi.list,
    staleTime: 20_000,
  });

  const connections = useMemo<Record<string, boolean>>(() => {
    const map: Record<string, boolean> = {};
    (connData?.connected ?? []).forEach((p) => (map[p] = true));
    return map;
  }, [connData]);

  const connectMut = useMutation({
    mutationFn: async (id: PlatformId) => {
      const { authorize_url } = await socialApi.connect(id);
      if (authorize_url) window.location.assign(authorize_url);
    },
  });
  const disconnectMut = useMutation({
    mutationFn: (id: PlatformId) => socialApi.disconnect(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["accounts"] }),
  });

  const connect = useCallback((id: PlatformId) => connectMut.mutate(id), [connectMut]);
  const disconnect = useCallback((id: PlatformId) => disconnectMut.mutate(id), [disconnectMut]);
  const isConnected = useCallback((id: PlatformId) => !!connections[id], [connections]);

  const bumpStats = useCallback((patch: Partial<Record<keyof AppStats, number>>) => {
    setStats((prev) => {
      const next = { ...prev };
      (Object.keys(patch) as (keyof AppStats)[]).forEach((k) => {
        next[k] = (next[k] || 0) + (patch[k] || 0);
      });
      return next;
    });
  }, []);

  const connectedPlatforms = useMemo(
    () => PLATFORMS.filter((p) => connections[p.id]),
    [connections],
  );

  const value = useMemo<SessionContextValue>(
    () => ({
      user,
      workspace,
      connections,
      connectedPlatforms,
      connect,
      disconnect,
      isConnected,
      stats,
      bumpStats,
      hydrated,
    }),
    [user, workspace, connections, connectedPlatforms, connect, disconnect, isConnected, stats, bumpStats, hydrated],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used within <SessionProvider>");
  return ctx;
}
