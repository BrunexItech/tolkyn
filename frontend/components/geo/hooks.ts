"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { geoApi, type GeoResult } from "@/lib/api/geo";
import { toast } from "@/lib/om/toast";

const KEY = ["geo"] as const;

export function useAreas() {
  return useQuery({ queryKey: [...KEY, "areas"], queryFn: geoApi.listAreas });
}

export function useGeoSummary() {
  return useQuery({ queryKey: [...KEY, "summary"], queryFn: geoApi.summary });
}

export function usePlaceSearch(q: string) {
  return useQuery({
    queryKey: [...KEY, "search", q],
    queryFn: () => geoApi.search(q),
    enabled: q.trim().length >= 2,
    staleTime: 60_000,
  });
}

export function useReverseGeocode() {
  return useMutation({
    mutationFn: ({ lat, lng }: { lat: number; lng: number }) => geoApi.reverse(lat, lng),
    onError: (e: Error) => toast.err(e.message || "Couldn't identify a place there"),
  });
}

function invalidate(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: KEY });
}

export function useAddArea() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (r: GeoResult & { radius_km: number; mode: "include" | "exclude" }) =>
      geoApi.createArea({
        label: r.label,
        display_name: r.display_name,
        country: r.country ?? undefined,
        country_code: r.country_code ?? undefined,
        region: r.region ?? undefined,
        city: r.city ?? undefined,
        place_type: r.place_type ?? undefined,
        osm_id: r.osm_id ?? undefined,
        lat: r.lat,
        lng: r.lng,
        radius_km: r.radius_km,
        mode: r.mode,
      }),
    onSuccess: () => {
      invalidate(qc);
      toast.ok("Area added");
    },
    onError: (e: Error) => toast.err(e.message),
  });
}

export function useUpdateArea() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; label?: string; radius_km?: number; mode?: string }) =>
      geoApi.updateArea(id, body),
    onSuccess: () => invalidate(qc),
    onError: (e: Error) => toast.err(e.message),
  });
}

export function useDeleteArea() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => geoApi.deleteArea(id),
    onSuccess: () => invalidate(qc),
    onError: (e: Error) => toast.err(e.message),
  });
}
