"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { phoneBookApi } from "@/lib/api/phonebook";
import type { BroadcastRecipient } from "@/lib/api/messaging";
import { toast } from "@/lib/om/toast";

const KEY = ["phonebooks"] as const;

export function usePhoneBooks() {
  return useQuery({ queryKey: [...KEY, "list"], queryFn: phoneBookApi.list });
}

export function usePhoneBook(id: string | null) {
  return useQuery({
    queryKey: [...KEY, "detail", id],
    queryFn: () => phoneBookApi.get(id as string),
    enabled: !!id,
  });
}

export function usePhoneBookDuplicates() {
  return useQuery({ queryKey: [...KEY, "duplicates"], queryFn: phoneBookApi.duplicates });
}

function inv(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: KEY });
}

export function useCreatePhoneBook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (b: { name: string; description?: string; color?: string }) => phoneBookApi.create(b),
    onSuccess: () => {
      inv(qc);
      toast.ok("Phone book created");
    },
    onError: (e: Error) => toast.err(e.message),
  });
}

export function useUpdatePhoneBook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...b }: { id: string; name?: string; description?: string; color?: string }) =>
      phoneBookApi.update(id, b),
    onSuccess: () => inv(qc),
    onError: (e: Error) => toast.err(e.message),
  });
}

export function useDeletePhoneBook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => phoneBookApi.remove(id),
    onSuccess: () => {
      inv(qc);
      toast.ok("Phone book deleted");
    },
    onError: (e: Error) => toast.err(e.message),
  });
}

export function useAddPhoneBookContacts() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, contacts, lead_ids }: { id: string; contacts?: BroadcastRecipient[]; lead_ids?: string[] }) =>
      phoneBookApi.addContacts(id, { contacts, lead_ids }),
    onSuccess: (res) => {
      inv(qc);
      const bits: string[] = [`${res.added} added`];
      if (res.skipped_duplicate) bits.push(`${res.skipped_duplicate} already here`);
      if (res.skipped_invalid) bits.push(`${res.skipped_invalid} invalid`);
      if (res.added > 0) toast.ok(bits.join(" · "));
      else toast.warn(bits.join(" · "));
      if (res.cross_book_phones.length > 0) {
        toast.warn(
          `${res.cross_book_phones.length} of these ${
            res.cross_book_phones.length === 1 ? "number is" : "numbers are"
          } also in another phone book`,
        );
      }
    },
    onError: (e: Error) => toast.err(e.message),
  });
}

export function useRemovePhoneBookContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, contactId }: { id: string; contactId: string }) =>
      phoneBookApi.removeContact(id, contactId),
    onSuccess: () => inv(qc),
    onError: (e: Error) => toast.err(e.message),
  });
}
