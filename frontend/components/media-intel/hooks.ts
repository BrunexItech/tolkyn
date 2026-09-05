"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { mediaIntelApi, type WatchKind } from "@/lib/api/mediaIntel";
import { toast } from "@/lib/om/toast";

const KEY = ["media-intel"] as const;

export function useWatches() {
  return useQuery({ queryKey: [...KEY, "watchlist"], queryFn: mediaIntelApi.listWatches });
}

export function useAdHocBrief() {
  return useMutation({
    mutationFn: ({ topic, kind }: { topic: string; kind: WatchKind }) =>
      mediaIntelApi.brief(topic, kind),
    onError: (e: Error) => toast.err(e.message),
  });
}

export function useAddWatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ topic, kind }: { topic: string; kind: WatchKind }) =>
      mediaIntelApi.addWatch(topic, kind),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
      toast.ok("Added to watchlist");
    },
    onError: (e: Error) => toast.err(e.message),
  });
}

export function useRefreshWatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => mediaIntelApi.refreshWatch(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
    onError: (e: Error) => toast.err(e.message),
  });
}

export function useDeleteWatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => mediaIntelApi.deleteWatch(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
    onError: (e: Error) => toast.err(e.message),
  });
}
