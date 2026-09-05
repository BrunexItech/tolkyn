"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { postsApi, type Post } from "@/lib/api/posts";
import { toast } from "@/lib/om/toast";
import { feedBus } from "@/components/om/feed-bus";

const KEY = ["posts"] as const;

/** Everything that has left the composer (drafts excluded). */
export function usePublishedPosts() {
  return useQuery({
    queryKey: [...KEY, "activity"],
    queryFn: async () => {
      const res = await postsApi.list();
      return {
        ...res,
        items: res.items.filter((p) => p.status !== "draft" && p.status !== "needs_approval"),
      };
    },
    refetchInterval: (q) => {
      const items = (q.state.data as { items: Post[] } | undefined)?.items ?? [];
      return items.some((p) => p.status === "publishing") ? 5000 : false;
    },
  });
}

export function usePostActivitySummary() {
  return useQuery({ queryKey: [...KEY, "summary"], queryFn: postsApi.summary });
}

/** Posts a non-owner/admin author submitted that are waiting on a reviewer.
 * 403s (and returns nothing) for anyone without the "approvals" permission —
 * treated as "nothing to show" rather than an error banner. */
export function useApprovalQueue() {
  return useQuery({
    queryKey: [...KEY, "needs_approval"],
    queryFn: () => postsApi.list("needs_approval"),
    retry: false,
    refetchInterval: 20_000,
  });
}

export function useApprovePost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => postsApi.approve(id),
    onSuccess: (post) => {
      invalidate(qc);
      toast.ok(post.status === "published" ? "Approved — now live" : "Approved and scheduled");
    },
    onError: (e: Error) => toast.err(e.message),
  });
}

export function useRejectPost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => postsApi.reject(id, reason),
    onSuccess: () => {
      invalidate(qc);
      toast.ok("Sent back to draft");
    },
    onError: (e: Error) => toast.err(e.message),
  });
}

function invalidate(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: KEY });
}

export function useRefreshPost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => postsApi.refresh(id),
    onSuccess: () => invalidate(qc),
    onError: (e: Error) => toast.err(e.message),
  });
}

export function useRetryPost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => postsApi.retry(id),
    onSuccess: (post) => {
      invalidate(qc);
      if (post.status === "published") {
        toast.ok("Retry succeeded — post is live");
        feedBus.emit("A failed post was retried and is now live", "ok");
      } else if (post.status === "partial") {
        toast.warn("Some platforms are still failing");
      } else if (post.status === "publishing") {
        toast.ok("Retrying…");
      } else {
        toast.err("Retry did not go through");
      }
    },
    onError: (e: Error) => toast.err(e.message),
  });
}

export function useDeleteActivityPost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => postsApi.remove(id),
    onSuccess: () => {
      invalidate(qc);
      toast.ok("Removed");
    },
    onError: (e: Error) => toast.err(e.message),
  });
}
