"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "@/lib/api/admin";
import type { IvrFlow } from "@/lib/api/callcenter";
import { toast } from "@/lib/om/toast";

const KEY = ["admin", "ivr"] as const;

/** Everything here is scoped to whichever workspace the operator picked on
 * the Call Flow page — same pattern as useTelephony/useUpdateTelephony. */
export function useAdminIvrAgents(workspaceId: string | null) {
  return useQuery({
    queryKey: [...KEY, "agents", workspaceId],
    queryFn: () => adminApi.getIvrAgents(workspaceId as string),
    enabled: !!workspaceId,
  });
}

export function useAdminIvr(workspaceId: string | null) {
  return useQuery({
    queryKey: [...KEY, "flow", workspaceId],
    queryFn: () => adminApi.getIvr(workspaceId as string),
    enabled: !!workspaceId,
  });
}

export function useAdminSaveIvr(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<IvrFlow>) => adminApi.updateIvr(workspaceId, patch),
    onSuccess: (data) => {
      qc.setQueryData([...KEY, "flow", workspaceId], data);
      toast.ok("Call flow saved");
    },
    onError: (e: Error) => toast.err(e.message),
  });
}

export function useAdminIvrCalls(workspaceId: string | null) {
  return useQuery({
    queryKey: [...KEY, "calls", workspaceId],
    queryFn: () => adminApi.getIvrCalls(workspaceId as string),
    enabled: !!workspaceId,
    refetchInterval: 4000,
  });
}
