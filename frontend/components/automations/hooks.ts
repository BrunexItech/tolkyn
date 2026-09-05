"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { automationsApi, type AutomationInput } from "@/lib/api/automations";
import { toast } from "@/lib/om/toast";

const KEY = ["automations"] as const;

export function useAutomations() {
  return useQuery({ queryKey: [...KEY, "list"], queryFn: automationsApi.list });
}
export function useAutomationSummary() {
  return useQuery({ queryKey: [...KEY, "summary"], queryFn: automationsApi.summary });
}
export function useAutomationRuns(id: string | null) {
  return useQuery({
    queryKey: [...KEY, "runs", id],
    queryFn: () => automationsApi.runs(id as string),
    enabled: !!id,
  });
}

function inv(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: KEY });
}

export function useCreateAutomation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (b: AutomationInput) => automationsApi.create(b),
    onSuccess: () => {
      inv(qc);
      toast.ok("Automation created");
    },
    onError: (e: Error) => toast.err(e.message),
  });
}
export function useToggleAutomation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      automationsApi.toggle(id, enabled),
    onSuccess: () => inv(qc),
    onError: (e: Error) => toast.err(e.message),
  });
}
export function useTestAutomation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => automationsApi.test(id),
    onSuccess: (run) => {
      inv(qc);
      toast.ok(run.summary || "Test run complete");
    },
    onError: (e: Error) => toast.err(e.message),
  });
}
export function useDeleteAutomation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => automationsApi.remove(id),
    onSuccess: () => {
      inv(qc);
      toast.ok("Automation deleted");
    },
    onError: (e: Error) => toast.err(e.message),
  });
}
