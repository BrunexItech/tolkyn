import { http, qs } from "./http";

export interface GeoResult {
  label: string;
  display_name: string;
  lat: number;
  lng: number;
  country: string | null;
  country_code: string | null;
  region: string | null;
  city: string | null;
  place_type: string | null;
  osm_id: string | null;
}

export interface TargetArea {
  id: string;
  label: string;
  display_name: string | null;
  country: string | null;
  country_code: string | null;
  region: string | null;
  city: string | null;
  place_type: string | null;
  lat: number;
  lng: number;
  radius_km: number;
  mode: "include" | "exclude";
  workspace_id: string;
  created_at: string;
  updated_at: string;
}

export interface GeoSummary {
  areas: number;
  includes: number;
  excludes: number;
  countries: string[];
  estimated_reach: number;
  matched_contacts: number;
  provider: string;
}

export const geoApi = {
  search: (q: string) => http.get<{ results: GeoResult[] }>(`/geo/search${qs({ q })}`),
  reverse: (lat: number, lng: number) => http.get<GeoResult>(`/geo/reverse${qs({ lat, lng })}`),
  summary: () => http.get<GeoSummary>("/geo/summary"),
  listAreas: () => http.get<{ items: TargetArea[] }>("/geo/areas"),
  createArea: (body: Partial<GeoResult> & { lat: number; lng: number; radius_km: number; mode?: string; label: string }) =>
    http.post<TargetArea>("/geo/areas", body),
  updateArea: (id: string, body: { label?: string; radius_km?: number; mode?: string }) =>
    http.patch<TargetArea>(`/geo/areas/${id}`, body),
  deleteArea: (id: string) => http.del<void>(`/geo/areas/${id}`),
};
