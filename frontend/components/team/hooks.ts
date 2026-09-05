"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { teamApi, type InviteInput, type MemberUpdate } from "@/lib/api/team";
import { toast } from "@/lib/om/toast";

const KEY = ["team"] as const;

export function useTeam() {
  return useQuery({ queryKey: [...KEY, "list"], queryFn: teamApi.list });
}
export function useTeamSummary() {
  return useQuery({ queryKey: [...KEY, "summary"], queryFn: teamApi.summary });
}
export function useMyRole() {
  return useQuery({ queryKey: [...KEY, "me"], queryFn: teamApi.me, staleTime: 60_000 });
}

function inv(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: KEY });
}

export function useInviteMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (b: InviteInput) => teamApi.invite(b),
    onSuccess: (res) => {
      inv(qc);
      if (!res.invite_link) toast.ok("Invite sent");
    },
    onError: (e: Error) => toast.err(e.message),
  });
}
export function useUpdateMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...b }: { id: string } & MemberUpdate) => teamApi.update(id, b),
    onSuccess: () => inv(qc),
    onError: (e: Error) => toast.err(e.message),
  });
}
export function useResendInvite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => teamApi.resend(id),
    onSuccess: () => {
      inv(qc);
      toast.ok("Invite resent");
    },
    onError: (e: Error) => toast.err(e.message),
  });
}
export function useRemoveMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => teamApi.remove(id),
    onSuccess: () => {
      inv(qc);
      toast.ok("Member removed");
    },
    onError: (e: Error) => toast.err(e.message),
  });
}
