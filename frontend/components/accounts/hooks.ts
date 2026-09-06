"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { socialApi } from "@/lib/api/social";
import { toast } from "@/lib/om/toast";
import { feedBus } from "@/components/om/feed-bus";

const KEY = ["accounts"] as const;

export function useConnections() {
  return useQuery({ queryKey: KEY, queryFn: socialApi.list });
}

/** Starts the OAuth flow and sends the browser to the platform's consent page. */
export function useConnect() {
  return useMutation({
    mutationFn: async (platform: string) => {
      const { authorize_url } = await socialApi.connect(platform);
      if (!authorize_url) throw new Error("Could not start the connection");
      window.location.assign(authorize_url);
      // Stay "pending" until the browser actually leaves the page — otherwise
      // the button flips back from its spinner for a beat before navigation,
      // which reads as a hang. This promise never resolves; the page unloads.
      await new Promise(() => {});
      return authorize_url;
    },
    onError: (e: Error) => toast.err(e.message),
  });
}

export function useDisconnect() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (platform: string) => socialApi.disconnect(platform),
    onSuccess: (res, platform) => {
      qc.invalidateQueries({ queryKey: KEY });
      feedBus.emit(`${platform} disconnected`, "info");
      if (res?.url) {
        window.open(res.url, "_blank", "noopener");
        toast.info("Finish removing the connection on the page that opened");
      }
    },
    onError: (e: Error) => toast.err(e.message),
  });
}

/** Opens the branded hosted page to connect / manage every channel at once. */
export function useConnectPage() {
  return useMutation({
    mutationFn: async () => {
      const { url } = await socialApi.connectPage();
      if (!url) throw new Error("Could not open the connect page");
      window.location.assign(url);
      // Hold the pending state through navigation (see useConnect).
      await new Promise(() => {});
      return url;
    },
    onError: (e: Error) => toast.err(e.message),
  });
}

export function useSyncConnections() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => socialApi.sync(),
    onSuccess: (data) => qc.setQueryData(KEY, data),
    onError: (e: Error) => toast.err(e.message),
  });
}
