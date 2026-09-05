"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { postsApi } from "@/lib/api/posts";
import { toast } from "@/lib/om/toast";

export function useCalendarPosts(start: string, end: string) {
  return useQuery({
    queryKey: ["posts", "calendar", start, end],
    queryFn: () => postsApi.calendar(start, end),
  });
}

export function usePostsSummary() {
  return useQuery({ queryKey: ["posts", "summary"], queryFn: postsApi.summary });
}

export function useAllPosts() {
  return useQuery({ queryKey: ["posts", "list", "all"], queryFn: () => postsApi.list() });
}

export function useRunScheduler() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => postsApi.runScheduler(),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["posts"] });
      toast.ok(r.published ? `Published ${r.published} due post(s)` : "Nothing due");
    },
    onError: (e: Error) => toast.err(e.message),
  });
}

export function useDeletePost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => postsApi.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["posts"] }),
    onError: (e: Error) => toast.err(e.message),
  });
}
