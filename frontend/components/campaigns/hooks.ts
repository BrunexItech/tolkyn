"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { campaignsApi, type CampaignInput } from "@/lib/api/campaigns";
import { toast } from "@/lib/om/toast";

const KEY = ["campaigns"] as const;

export function useCampaigns() {
  return useQuery({ queryKey: [...KEY, "list"], queryFn: campaignsApi.list });
}
export function useCampaignSummary() {
  return useQuery({ queryKey: [...KEY, "summary"], queryFn: campaignsApi.summary });
}
export function useCampaign(id: string | null) {
  return useQuery({
    queryKey: [...KEY, "detail", id],
    queryFn: () => campaignsApi.get(id as string),
    enabled: !!id,
  });
}

function inv(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: KEY });
}

export function useCreateCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (b: CampaignInput) => campaignsApi.create(b),
    onSuccess: () => {
      inv(qc);
      toast.ok("Campaign created");
    },
    onError: (e: Error) => toast.err(e.message),
  });
}
export function useUpdateCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...b }: { id: string } & CampaignInput) => campaignsApi.update(id, b),
    onSuccess: () => inv(qc),
    onError: (e: Error) => toast.err(e.message),
  });
}
export function useDeleteCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => campaignsApi.remove(id),
    onSuccess: () => {
      inv(qc);
      toast.ok("Campaign deleted");
    },
    onError: (e: Error) => toast.err(e.message),
  });
}
export function useAttachPost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, post_id, attach }: { id: string; post_id: string; attach: boolean }) =>
      campaignsApi.attachPost(id, post_id, attach),
    onSuccess: () => inv(qc),
    onError: (e: Error) => toast.err(e.message),
  });
}
