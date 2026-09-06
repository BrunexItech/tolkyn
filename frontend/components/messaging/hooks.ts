"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  campaignGroupApi,
  messagingApi,
  whatsappWebApi,
  type BroadcastChannel,
  type BroadcastInput,
  type CampaignRecipient,
  type ContactFilters,
} from "@/lib/api/messaging";
import { toast } from "@/lib/om/toast";

const KEY = ["messaging"] as const;

export function useMessagingSummary() {
  return useQuery({ queryKey: [...KEY, "summary"], queryFn: messagingApi.summary });
}

export function useBroadcasts(channel: BroadcastChannel) {
  return useQuery({
    queryKey: [...KEY, "broadcasts", channel],
    queryFn: () => messagingApi.list(channel),
  });
}

export function useMessagingContacts(filters: ContactFilters, enabled = true) {
  return useQuery({
    queryKey: [...KEY, "contacts", filters],
    queryFn: () => messagingApi.contacts(filters),
    enabled,
  });
}

export function useImportCsv() {
  return useMutation({
    mutationFn: (file: File) => messagingApi.importCsv(file),
    onError: (e: Error) => toast.err(e.message),
  });
}

function inv(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: KEY });
}

export function useCreateBroadcast() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (b: BroadcastInput) => messagingApi.create(b),
    onSuccess: () => {
      inv(qc);
      toast.ok("Broadcast saved");
    },
    onError: (e: Error) => toast.err(e.message),
  });
}

export function useSendBroadcast() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => messagingApi.send(id),
    onSuccess: (b) => {
      inv(qc);
      const failed = b.failed_count;
      if (failed === 0) toast.ok(`Sent to ${b.sent_count} ${b.sent_count === 1 ? "recipient" : "recipients"}`);
      else toast.warn(`${b.sent_count} sent, ${failed} failed`);
    },
    onError: (e: Error) => toast.err(e.message),
  });
}

export function useDeleteBroadcast() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => messagingApi.remove(id),
    onSuccess: () => inv(qc),
    onError: (e: Error) => toast.err(e.message),
  });
}

// ---- self-hosted WhatsApp Web (Baileys) — unofficial, at-your-own-risk ----
export function useWhatsAppWebStatus(enabled = true) {
  return useQuery({
    queryKey: [...KEY, "whatsapp-web", "status"],
    queryFn: whatsappWebApi.status,
    enabled,
    // Polls fast only while a QR is up (waiting on a scan) or mid-handshake —
    // same "poll while pending" idea as the call-center badge elsewhere.
    refetchInterval: (q) => {
      const s = q.state.data?.status;
      return s === "qr" || s === "connecting" || s === "linking" ? 2500 : 15000;
    },
  });
}

export function useConnectWhatsAppWeb() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: whatsappWebApi.connect,
    onSuccess: () => qc.invalidateQueries({ queryKey: [...KEY, "whatsapp-web"] }),
    onError: (e: Error) => toast.err(e.message),
  });
}

export function useDisconnectWhatsAppWeb() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: whatsappWebApi.disconnect,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...KEY, "whatsapp-web"] });
      toast.ok("WhatsApp disconnected");
    },
    onError: (e: Error) => toast.err(e.message),
  });
}

// ---- Campaign groups ("communities") — shared conversation, masked identity
export function useCampaignGroups() {
  return useQuery({ queryKey: [...KEY, "campaign-groups"], queryFn: campaignGroupApi.list });
}

export function useCampaignGroup(id: string | null) {
  return useQuery({
    queryKey: [...KEY, "campaign-groups", id],
    queryFn: () => campaignGroupApi.get(id as string),
    enabled: !!id,
    // Cheap polling so a relayed reply shows up without a manual refresh —
    // same "keep it live while open" idea as the inbox thread view.
    refetchInterval: 8000,
  });
}

export function useCreateCampaignGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (b: { name: string; recipients: CampaignRecipient[]; initial_message?: string }) =>
      campaignGroupApi.create(b),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: [...KEY, "campaign-groups"] });
      if (res.send_errors.length > 0) {
        toast.warn(`Group created — ${res.send_errors.length} opening message(s) failed to send`);
      } else {
        toast.ok("Campaign group created");
      }
    },
    onError: (e: Error) => toast.err(e.message),
  });
}

export function useSendCampaignGroupMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: string }) => campaignGroupApi.sendMessage(id, body),
    onSuccess: (detail, v) => {
      qc.setQueryData([...KEY, "campaign-groups", v.id], detail);
      qc.invalidateQueries({ queryKey: [...KEY, "campaign-groups"] });
      if (detail.send_errors.length > 0) {
        toast.warn(`Sent — ${detail.send_errors.length} recipient(s) failed`);
      }
    },
    onError: (e: Error) => toast.err(e.message),
  });
}
