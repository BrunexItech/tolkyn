"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  crmApi,
  type Customer,
  type CustomerCreate,
  type CustomerFilters,
  type LogContactBody,
} from "@/lib/api/crm";
import { toast } from "@/lib/om/toast";
import { feedBus } from "@/components/om/feed-bus";

const KEY = ["customers"] as const;

export function useCustomers(filters: CustomerFilters) {
  return useQuery({
    queryKey: [...KEY, "list", filters],
    queryFn: () => crmApi.list(filters),
  });
}

export function useCustomerSummary() {
  return useQuery({ queryKey: [...KEY, "summary"], queryFn: crmApi.summary });
}

export function useCustomer(id: string | null) {
  return useQuery({
    queryKey: [...KEY, "item", id],
    queryFn: () => crmApi.get(id as string),
    enabled: !!id,
  });
}

function invalidate(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: KEY });
}

export function useCreateCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CustomerCreate) => crmApi.create(body),
    onSuccess: () => {
      invalidate(qc);
      toast.ok("Customer added");
      feedBus.emit("New customer added to the CRM", "ok");
    },
    onError: (e: Error) => toast.err(e.message),
  });
}

export function useUpdateCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & Partial<CustomerCreate>) =>
      crmApi.update(id, body),
    onSuccess: () => invalidate(qc),
    onError: (e: Error) => toast.err(e.message),
  });
}

export function useDeleteCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => crmApi.remove(id),
    onSuccess: () => {
      invalidate(qc);
      toast.ok("Customer removed");
    },
    onError: (e: Error) => toast.err(e.message),
  });
}

export function useLogContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & LogContactBody) => crmApi.logContact(id, body),
    onSuccess: (_d, v) => {
      invalidate(qc);
      qc.invalidateQueries({ queryKey: [...KEY, "interactions", v.id] });
      toast.ok("Contact logged");
    },
    onError: (e: Error) => toast.err(e.message),
  });
}

export function useInteractions(id: string | null) {
  return useQuery({
    queryKey: [...KEY, "interactions", id],
    queryFn: () => crmApi.interactions(id as string),
    enabled: !!id,
  });
}

export function useDeleteInteraction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, interactionId }: { id: string; interactionId: string }) =>
      crmApi.deleteInteraction(id, interactionId),
    onSuccess: (_d, v) => {
      invalidate(qc);
      qc.invalidateQueries({ queryKey: [...KEY, "interactions", v.id] });
    },
    onError: (e: Error) => toast.err(e.message),
  });
}

export type { Customer };
