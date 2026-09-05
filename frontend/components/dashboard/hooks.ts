"use client";

import { useQuery } from "@tanstack/react-query";
import { analyticsApi } from "@/lib/api/analytics";
import { postsApi } from "@/lib/api/posts";

export function useOverview(days = 30) {
  return useQuery({
    queryKey: ["analytics", "overview", days],
    queryFn: () => analyticsApi.overview(days),
    staleTime: 60_000,
  });
}

export function useTimeseries(days = 14) {
  return useQuery({
    queryKey: ["analytics", "ts", days],
    queryFn: () => analyticsApi.timeseries(days),
    staleTime: 60_000,
  });
}

export function useByPlatform(days = 30) {
  return useQuery({
    queryKey: ["analytics", "plat", days],
    queryFn: () => analyticsApi.byPlatform(days),
    staleTime: 60_000,
  });
}

export function useTopPosts(limit = 6) {
  return useQuery({
    queryKey: ["analytics", "top", limit],
    queryFn: () => analyticsApi.topPosts(limit),
    staleTime: 60_000,
  });
}

export function useAllPosts() {
  return useQuery({
    queryKey: ["posts", "list", "all"],
    queryFn: () => postsApi.list(),
    staleTime: 30_000,
  });
}

export function usePostsSummary() {
  return useQuery({
    queryKey: ["posts", "summary"],
    queryFn: postsApi.summary,
    staleTime: 30_000,
  });
}
