"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  leadsApi,
  type DiscoverRequest,
  type GenerateRequest,
  type Lead,
  type LeadCreate,
  type LeadFilters,
  type LeadStatus,
} from "@/lib/api/leads";
import { emailApi } from "@/lib/api/email";
import { toast } from "@/lib/om/toast";
import { feedBus } from "@/components/om/feed-bus";

const KEY = ["leads"] as const;

export function useEmailAccounts() {
  return useQuery({ queryKey: ["email-accounts"], queryFn: emailApi.list });
}

export function useSendOutreach() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id: string;
      email_account_id: string;
      include_proposal?: boolean;
    }) => leadsApi.send(id, body),
    onSuccess: (res, vars) => {
      qc.invalidateQueries({ queryKey: ["leads", "item", vars.id] });
      qc.invalidateQueries({ queryKey: ["leads", "list"] });
      qc.invalidateQueries({ queryKey: ["email-accounts"] });
      if (res.status === "sent") {
        toast.ok("Email sent");
        feedBus.emit(`Outreach email sent to ${res.to_email}`, "ok");
      } else {
        toast.warn(res.detail || `Not sent (${res.status})`);
      }
    },
    onError: (e: Error) => toast.err(e.message),
  });
}

export function useSendBulk() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { lead_ids: string[]; email_account_id: string; include_proposal?: boolean }) =>
      leadsApi.sendBulk(body),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["email-accounts"] });
      const parts = [`${res.sent} sent`];
      if (res.failed) parts.push(`${res.failed} failed`);
      if (res.skipped) parts.push(`${res.skipped} skipped`);
      (res.sent ? toast.ok : toast.warn)(parts.join(" · "));
      feedBus.emit(`Bulk outreach: ${parts.join(", ")}`, res.sent ? "ok" : "warn");
    },
    onError: (e: Error) => toast.err(e.message),
  });
}

export function useLeads(filters: LeadFilters) {
  return useQuery({
    queryKey: [...KEY, "list", filters],
    queryFn: () => leadsApi.list(filters),
  });
}

export function useLeadSummary() {
  return useQuery({ queryKey: [...KEY, "summary"], queryFn: leadsApi.summary });
}

export function useLead(id: string | null) {
  return useQuery({
    queryKey: [...KEY, "item", id],
    queryFn: () => leadsApi.get(id as string),
    enabled: !!id,
  });
}

function invalidate(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: KEY });
}

export function useGenerateLeads() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: GenerateRequest) => leadsApi.generate(body),
    onSuccess: (res) => {
      invalidate(qc);
      feedBus.emit(
        `Lead generator: ${res.stats.saved} saved from ${res.stats.pages_crawled} pages`,
        res.stats.saved ? "ok" : "warn",
      );
    },
    onError: (e: Error) => toast.err(e.message),
  });
}

export function useDiscoverLeads() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: DiscoverRequest) => leadsApi.discover(body),
    onSuccess: (res) => {
      invalidate(qc);
      feedBus.emit(
        `Lead search: ${res.stats.saved} companies saved (${res.stats.sites_scanned} sites scanned)`,
        res.stats.saved ? "ok" : "warn",
      );
    },
    onError: (e: Error) => toast.err(e.message),
  });
}

export function useGenerateOutreach() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id: string;
      offer?: string;
      from_company?: string;
      from_website?: string;
      tone?: string;
      regenerate?: boolean;
    }) => leadsApi.generateOutreach(id, body),
    onSuccess: (_res, vars) => {
      qc.invalidateQueries({ queryKey: ["leads", "item", vars.id] });
      qc.invalidateQueries({ queryKey: ["leads", "list"] });
      toast.ok("Email & proposal ready");
      feedBus.emit("AI drafted an email and proposal for a lead", "ok");
    },
    onError: (e: Error) => toast.err(e.message),
  });
}

export function useCreateLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: LeadCreate) => leadsApi.create(body),
    onSuccess: () => {
      invalidate(qc);
      toast.ok("Lead added");
    },
    onError: (e: Error) => toast.err(e.message),
  });
}

export function useUpdateLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & Partial<LeadCreate> & { status?: LeadStatus }) =>
      leadsApi.update(id, body),
    onSuccess: () => invalidate(qc),
    onError: (e: Error) => toast.err(e.message),
  });
}

export function useDeleteLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => leadsApi.remove(id),
    onSuccess: () => {
      invalidate(qc);
      toast.ok("Lead deleted");
    },
    onError: (e: Error) => toast.err(e.message),
  });
}

export function useConvertLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id: string;
      stage?: string;
      monthly_value?: number;
      next_action?: string;
    }) => leadsApi.convert(id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["customers"] });
      toast.ok("Pushed to CRM");
      feedBus.emit("Lead converted to a CRM customer", "ok");
    },
    onError: (e: Error) => toast.err(e.message),
  });
}

export type { Lead };
