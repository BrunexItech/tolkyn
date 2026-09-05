"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { callCenterApi, type IvrFlow } from "@/lib/api/callcenter";
import { toast } from "@/lib/om/toast";

const IVR_KEY = ["call-center", "ivr"] as const;

export function useIvr() {
  return useQuery({ queryKey: IVR_KEY, queryFn: callCenterApi.getIvr });
}

export function useSaveIvr() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<IvrFlow>) => callCenterApi.updateIvr(patch),
    onSuccess: (data) => {
      qc.setQueryData(IVR_KEY, data);
      toast.ok("Call flow saved");
    },
    onError: (e: Error) => toast.err(e.message),
  });
}

export function useCallAgents() {
  return useQuery({
    queryKey: ["call-center", "agents-for-ivr"],
    queryFn: async () => (await callCenterApi.overview()).agents,
    staleTime: 60_000,
  });
}
