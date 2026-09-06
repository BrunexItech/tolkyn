"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { emailApi, type EmailAccountCreate } from "@/lib/api/email";
import {
  accountApi,
  type Me,
  type PasswordChange,
  type ProfileUpdate,
} from "@/lib/api/account";
import { toast } from "@/lib/om/toast";

const ME_KEY = ["account", "me"] as const;

/** The signed-in user's own profile (name, contact, timezone, language). */
export function useMe() {
  return useQuery({ queryKey: ME_KEY, queryFn: accountApi.me });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: ProfileUpdate) => accountApi.updateProfile(data),
    onSuccess: (me: Me) => {
      qc.setQueryData(ME_KEY, me);
      // Keep the cached "user" that the sidebar/topbar read on load in sync.
      try {
        const raw = localStorage.getItem("user");
        const prev = raw ? JSON.parse(raw) : {};
        localStorage.setItem("user", JSON.stringify({ ...prev, name: me.name, email: me.email }));
      } catch {
        /* ignore */
      }
      toast.ok("Profile saved");
    },
    onError: (e: Error) => toast.err(e.message),
  });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: (data: PasswordChange) => accountApi.changePassword(data),
    onSuccess: () => toast.ok("Password changed"),
    onError: (e: Error) => toast.err(e.message),
  });
}

const KEY = ["email-accounts"] as const;

export function useEmailAccounts() {
  return useQuery({ queryKey: KEY, queryFn: emailApi.list });
}

export function useCreateEmailAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: EmailAccountCreate) => emailApi.create(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
      toast.ok("Sending account added");
    },
    onError: (e: Error) => toast.err(e.message),
  });
}

export function useUpdateEmailAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & Partial<EmailAccountCreate>) =>
      emailApi.update(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
    onError: (e: Error) => toast.err(e.message),
  });
}

export function useDeleteEmailAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => emailApi.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
      toast.ok("Account removed");
    },
    onError: (e: Error) => toast.err(e.message),
  });
}

export function useTestEmailAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, to_email }: { id: string; to_email?: string }) => emailApi.test(id, to_email),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: KEY });
      (res.ok ? toast.ok : toast.err)(res.message);
    },
    onError: (e: Error) => toast.err(e.message),
  });
}
