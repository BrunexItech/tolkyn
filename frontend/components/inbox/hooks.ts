"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { inboxApi, type InboxFilters, type ThreadStatus } from "@/lib/api/inbox";
import { toast } from "@/lib/om/toast";

const KEY = ["inbox"] as const;

export function useThreads(filters: InboxFilters) {
  return useQuery({
    queryKey: [...KEY, "list", filters],
    queryFn: () => inboxApi.list(filters),
    // Keep the queue live without a manual refresh — new comments/DMs/WhatsApp
    // messages surface on their own.
    refetchInterval: 15_000,
  });
}

export function useInboxSummary() {
  return useQuery({
    queryKey: [...KEY, "summary"],
    queryFn: inboxApi.summary,
    refetchInterval: 15_000,
  });
}

export function useRefreshInbox() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => inboxApi.refresh(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
      toast.ok("Inbox refreshed");
    },
    onError: (e: Error) => toast.err(e.message),
  });
}

export function useThread(id: string | null) {
  return useQuery({
    queryKey: [...KEY, "thread", id],
    queryFn: () => inboxApi.get(id as string),
    enabled: !!id,
    // The conversation you're looking at stays live — an incoming reply lands
    // in the open thread on its own, not just in the list/notifications.
    // GET /inbox/{id} also marks it read, so an actively-watched thread stops
    // nagging the bell.
    refetchInterval: 7_000,
  });
}

export function useReply() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body, via }: { id: string; body: string; via?: string }) =>
      inboxApi.reply(id, body, via),
    onSuccess: (detail, v) => {
      qc.setQueryData([...KEY, "thread", v.id], detail);
      qc.invalidateQueries({ queryKey: [...KEY, "list"] });
      qc.invalidateQueries({ queryKey: [...KEY, "summary"] });
    },
    onError: (e: Error) => toast.err(e.message),
  });
}

export function useSetStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: ThreadStatus }) =>
      inboxApi.setStatus(id, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
    onError: (e: Error) => toast.err(e.message),
  });
}
