"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  socialLeadsApi,
  type ConvertSocialLeadBody,
  type SocialLeadFilters,
  type SocialLeadStatus,
} from "@/lib/api/socialLeads";
import { toast } from "@/lib/om/toast";
import { feedBus } from "@/components/om/feed-bus";

const KEY = ["social-leads"] as const;

export function useSocialLeads(filters: SocialLeadFilters) {
  return useQuery({
    queryKey: [...KEY, "list", filters],
    queryFn: () => socialLeadsApi.list(filters),
  });
}

export function useSocialLeadSummary() {
  return useQuery({
    queryKey: [...KEY, "summary"],
    queryFn: socialLeadsApi.summary,
    staleTime: 20_000,
  });
}

function invalidate(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: KEY });
}

export function useScanSocialLeads() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: socialLeadsApi.scan,
    onSuccess: (res) => {
      invalidate(qc);
      if (res.new_leads > 0 || res.classified > 0) {
        toast.ok(res.message);
        if (res.new_leads > 0)
          feedBus.emit(`${res.new_leads} new social lead(s) detected`, "ok");
      } else {
        toast.info(res.message);
      }
      if (!res.ai) {
        toast.warn(
          "AI classifier is offline (OpenAI credits) — used keyword matching instead.",
        );
      }
    },
    onError: (e: Error) => toast.err(e.message),
  });
}

export function useSetSocialLeadStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: SocialLeadStatus }) =>
      socialLeadsApi.setStatus(id, status),
    onSuccess: () => invalidate(qc),
    onError: (e: Error) => toast.err(e.message),
  });
}

export function useReclassifySocialLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => socialLeadsApi.reclassify(id),
    onSuccess: () => {
      invalidate(qc);
      toast.ok("Re-analysed");
    },
    onError: (e: Error) => toast.err(e.message),
  });
}

export function useReplySocialLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: string }) =>
      socialLeadsApi.reply(id, body),
    onSuccess: () => {
      invalidate(qc);
      qc.invalidateQueries({ queryKey: ["inbox"] });
      toast.ok("Reply sent");
      feedBus.emit("Replied to a social lead", "ok");
    },
    onError: (e: Error) => toast.err(e.message),
  });
}

export function useConvertSocialLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & ConvertSocialLeadBody) =>
      socialLeadsApi.convert(id, body),
    onSuccess: (res) => {
      invalidate(qc);
      qc.invalidateQueries({ queryKey: ["customers"] });
      toast.ok(res.already ? "Already in the CRM" : "Added to the CRM");
      if (!res.already) feedBus.emit("Social lead converted to a customer", "ok");
    },
    onError: (e: Error) => toast.err(e.message),
  });
}
