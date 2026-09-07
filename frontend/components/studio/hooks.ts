"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { studioApi, type AssetKind } from "@/lib/api/studio";
import { toast } from "@/lib/om/toast";
import { feedBus } from "@/components/om/feed-bus";

const KEY = ["studio"] as const;

export function useAssets(kind?: AssetKind) {
  return useQuery({ queryKey: [...KEY, "assets", kind ?? "all"], queryFn: () => studioApi.assets(kind) });
}

function done(qc: ReturnType<typeof useQueryClient>, label: string) {
  qc.invalidateQueries({ queryKey: KEY });
  feedBus.emit(`Content Studio: ${label}`, "ok");
}

export function useGenerateCopy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: studioApi.copy,
    onSuccess: () => done(qc, "copy generated"),
    onError: (e: Error) => toast.err(e.message),
  });
}

export function useBuildPrompt() {
  return useMutation({
    mutationFn: studioApi.buildPrompt,
    onError: (e: Error) => toast.err(e.message),
  });
}

/** Kick off a background image job (returns { id, status: "queued" }). */
export function useGenerateImage() {
  return useMutation({
    mutationFn: studioApi.image,
    onError: (e: Error) => toast.err(e.message),
  });
}

/** Kick off a background conversational image turn. */
export function useImageChat() {
  return useMutation({
    mutationFn: studioApi.imageChat,
    // errors are shown inline in the chat thread, not as a toast
  });
}

/** Poll one image job until it finishes (every 1.8s while still running). */
export function useImageJob(id: string | null) {
  return useQuery({
    queryKey: [...KEY, "job", id],
    queryFn: () => studioApi.imageJob(id as string),
    enabled: !!id,
    refetchInterval: (q) => {
      const s = q.state.data?.status;
      return s === "succeeded" || s === "failed" ? false : 1800;
    },
  });
}

export function useSaveCaption() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: studioApi.saveCaption,
    onSuccess: () => done(qc, "caption saved"),
    onError: (e: Error) => toast.err(e.message),
  });
}

export function useDeleteAsset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => studioApi.deleteAsset(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
    onError: (e: Error) => toast.err(e.message),
  });
}

export function useBrandKit() {
  return useQuery({ queryKey: [...KEY, "brand"], queryFn: studioApi.brand });
}

export function useSetBrandKit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { logoUrl: string; colors: string[] }) => studioApi.setBrand(v.logoUrl, v.colors),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...KEY, "brand"] });
      toast.ok("Brand logo saved");
    },
    onError: (e: Error) => toast.err(e.message),
  });
}

export function useClearBrandKit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: studioApi.clearBrand,
    onSuccess: () => qc.invalidateQueries({ queryKey: [...KEY, "brand"] }),
    onError: (e: Error) => toast.err(e.message),
  });
}
