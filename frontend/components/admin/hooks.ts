"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  adminApi,
  type OrgStatus,
  type SubStatus,
  type PackageInput,
  type TelephonyConfigInput,
} from "@/lib/api/admin";
import { toast } from "@/lib/om/toast";

const KEY = ["admin"] as const;

export function useOverview() {
  return useQuery({ queryKey: [...KEY, "overview"], queryFn: adminApi.overview, refetchInterval: 30_000 });
}

export function useOrganizations() {
  return useQuery({ queryKey: [...KEY, "orgs"], queryFn: adminApi.listOrganizations });
}

function invalidate(qc: ReturnType<typeof useQueryClient>, key: string) {
  qc.invalidateQueries({ queryKey: [...KEY, key] });
}

export function useCreateOrganization() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; slug: string; notes?: string; owner_user_id?: string }) =>
      adminApi.createOrganization(body),
    onSuccess: () => {
      invalidate(qc, "orgs");
      toast.ok("Organization created");
    },
    onError: (e: Error) => toast.err(e.message),
  });
}

export function useUpdateOrganization() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (
      { id, ...body }: { id: string; name?: string; status?: OrgStatus; notes?: string; owner_user_id?: string | null },
    ) => adminApi.updateOrganization(id, body),
    onSuccess: () => invalidate(qc, "orgs"),
    onError: (e: Error) => toast.err(e.message),
  });
}

/** Real, approved + active accounts — the only ones eligible to be an
 * Organization's main account or a Subsidiary's linked workspace. */
export function useApprovedUsers() {
  return useQuery({
    queryKey: [...KEY, "approved-users"],
    queryFn: () => adminApi.listUsers({ approval: "approved", status: "active", limit: 200 }),
  });
}

export function useDeleteOrganization() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => adminApi.deleteOrganization(id),
    onSuccess: () => {
      invalidate(qc, "orgs");
      toast.ok("Organization removed");
    },
    onError: (e: Error) => toast.err(e.message),
  });
}

export function useCreateSubsidiary() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { organization_id: string; name: string; subdomain: string; workspace_id: string; notes?: string }) =>
      adminApi.createSubsidiary(body),
    onSuccess: () => {
      invalidate(qc, "orgs");
      toast.ok("Subdomain created");
    },
    onError: (e: Error) => toast.err(e.message),
  });
}

export function useUpdateSubsidiary() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; name?: string; status?: SubStatus; workspace_id?: string | null; notes?: string }) =>
      adminApi.updateSubsidiary(id, body),
    onSuccess: () => invalidate(qc, "orgs"),
    onError: (e: Error) => toast.err(e.message),
  });
}

export function useDeleteSubsidiary() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => adminApi.deleteSubsidiary(id),
    onSuccess: () => {
      invalidate(qc, "orgs");
      toast.ok("Subdomain removed");
    },
    onError: (e: Error) => toast.err(e.message),
  });
}

export function usePlatformUsers(
  filters: { search?: string; role?: string; status?: string; approval?: string; limit?: number; offset?: number },
) {
  return useQuery({ queryKey: [...KEY, "users", filters], queryFn: () => adminApi.listUsers(filters) });
}

export function useUserUsage(id: string | null) {
  return useQuery({
    queryKey: [...KEY, "usage", id],
    queryFn: () => adminApi.userUsage(id as string),
    enabled: !!id,
  });
}

/** Fresh single-user detail — carries today's generation counts + effective
 * limits, which the list response doesn't compute. */
export function useAdminUser(id: string | null) {
  return useQuery({
    queryKey: [...KEY, "user", id],
    queryFn: () => adminApi.getUser(id as string),
    enabled: !!id,
  });
}

export function useVideoModelCatalog() {
  return useQuery({ queryKey: [...KEY, "video-models"], queryFn: adminApi.videoModels, staleTime: 5 * 60_000 });
}

export function useVideoUsage() {
  return useQuery({ queryKey: [...KEY, "video-usage"], queryFn: adminApi.videoUsage });
}

export function useUpdateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (
      { id, ...body }: {
        id: string;
        role?: string;
        status?: string;
        is_approved?: boolean;
        allowed_video_models?: string[];
        video_budget_usd?: number | null;
        daily_image_limit?: number | null;
        daily_video_limit?: number | null;
        module_overrides?: Record<string, boolean>;
        package_id?: string | null;
      },
    ) => adminApi.updateUser(id, body),
    onSuccess: (_data, vars) => {
      invalidate(qc, "users");
      invalidate(qc, "video-usage");
      qc.invalidateQueries({ queryKey: ["admin", "user", vars.id] });
      toast.ok("Updated");
    },
    onError: (e: Error) => toast.err(e.message),
  });
}

// -------------------------------------------------------------- packages
export function usePackages() {
  return useQuery({ queryKey: [...KEY, "packages"], queryFn: adminApi.listPackages });
}

export function useCreatePackage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: PackageInput) => adminApi.createPackage(body),
    onSuccess: () => {
      invalidate(qc, "packages");
      toast.ok("Package created");
    },
    onError: (e: Error) => toast.err(e.message),
  });
}

export function useUpdatePackage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & Partial<PackageInput>) => adminApi.updatePackage(id, body),
    onSuccess: () => {
      invalidate(qc, "packages");
      invalidate(qc, "users");
    },
    onError: (e: Error) => toast.err(e.message),
  });
}

export function useDeletePackage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => adminApi.deletePackage(id),
    onSuccess: () => {
      invalidate(qc, "packages");
      toast.ok("Package deleted");
    },
    onError: (e: Error) => toast.err(e.message),
  });
}

// --------------------------------------------------------- announcements
export function useAnnouncements() {
  return useQuery({ queryKey: [...KEY, "announcements"], queryFn: adminApi.listAnnouncements });
}

export function useSendAnnouncement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { subject: string; body: string; audience: Record<string, unknown> }) =>
      adminApi.sendAnnouncement(body as never),
    onSuccess: (row) => {
      invalidate(qc, "announcements");
      toast.ok(`Sent to ${row.sent}/${row.total} — ${row.failed} failed`);
    },
    onError: (e: Error) => toast.err(e.message),
  });
}

// ------------------------------------------------------------- telephony
export function useTelephony(workspaceId: string | null) {
  return useQuery({
    queryKey: [...KEY, "telephony", workspaceId],
    queryFn: () => adminApi.getTelephony(workspaceId as string),
    enabled: !!workspaceId,
  });
}

export function useUpdateTelephony(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: TelephonyConfigInput) => adminApi.updateTelephony(workspaceId, body),
    onSuccess: (data) => {
      qc.setQueryData([...KEY, "telephony", workspaceId], data);
      toast.ok("Telephony settings saved");
    },
    onError: (e: Error) => toast.err(e.message),
  });
}

export function useApproveUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => adminApi.approveUser(id),
    onSuccess: () => {
      invalidate(qc, "users");
      invalidate(qc, "approved-users");
      toast.ok("Account approved — they can now log in to the dashboard");
    },
    onError: (e: Error) => toast.err(e.message),
  });
}

export function useActivity(filters: { user_id?: string; workspace_id?: string; action?: string; limit?: number; offset?: number }) {
  return useQuery({ queryKey: [...KEY, "activity", filters], queryFn: () => adminApi.listActivity(filters) });
}
