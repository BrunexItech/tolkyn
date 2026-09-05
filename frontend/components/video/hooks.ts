"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { videoApi, type VideoGenerateRequest } from "@/lib/api/video";
import { toast } from "@/lib/om/toast";

const KEY = ["video"] as const;

export function useVideoModels() {
  return useQuery({ queryKey: [...KEY, "models"], queryFn: videoApi.models });
}

export function useVideoJobs() {
  return useQuery({
    queryKey: [...KEY, "jobs"],
    queryFn: videoApi.list,
    // Keep polling while anything is still generating; a Veo job typically
    // takes 1-2 minutes, so this settles down once everything is finished.
    refetchInterval: (q) => {
      const items = q.state.data?.items ?? [];
      const inFlight = items.some((j) => j.status === "queued" || j.status === "running");
      return inFlight ? 6000 : false;
    },
  });
}

export function useGenerateVideo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: VideoGenerateRequest) => videoApi.generate(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...KEY, "jobs"] });
      qc.invalidateQueries({ queryKey: [...KEY, "models"] });
      toast.ok("Generating — this usually takes 1-2 minutes");
    },
    onError: (e: Error) => toast.err(e.message),
  });
}

export function useEnhancePrompt() {
  return useMutation({
    mutationFn: ({ idea, brand_colors }: { idea: string; brand_colors?: string[] }) =>
      videoApi.enhancePrompt(idea, brand_colors),
    onError: (e: Error) => toast.err(e.message),
  });
}

export function useSetBrand() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ logoUrl, colors }: { logoUrl: string; colors: string[] }) => videoApi.setBrand(logoUrl, colors),
    onSuccess: (data) => {
      qc.setQueryData([...KEY, "models"], data);
      toast.ok("Brand saved — every video from now on will carry it");
    },
    onError: (e: Error) => toast.err(e.message),
  });
}

export function useClearBrand() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => videoApi.clearBrand(),
    onSuccess: (data) => {
      qc.setQueryData([...KEY, "models"], data);
      toast.ok("Brand removed");
    },
    onError: (e: Error) => toast.err(e.message),
  });
}

export function useDeleteVideo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => videoApi.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: [...KEY, "jobs"] }),
    onError: (e: Error) => toast.err(e.message),
  });
}
