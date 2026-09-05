"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { Map as MapIcon } from "lucide-react";
import { SectionHeading } from "@/components/om/primitives/SectionHeading";
import { Card } from "@/components/om/primitives/Card";
import { GeoStats } from "@/components/geo/GeoStats";
import { PlaceSearch } from "@/components/geo/PlaceSearch";
import { AreaList } from "@/components/geo/AreaList";
import { useAreas, useAddArea, useReverseGeocode } from "@/components/geo/hooks";

const MapCanvas = dynamic(() => import("@/components/geo/MapCanvas"), {
  ssr: false,
  loading: () => (
    <div className="grid h-full place-items-center text-[12px] text-om-muted">Loading map…</div>
  ),
});

export default function GeoPage() {
  const { data } = useAreas();
  const [focus, setFocus] = useState<{ lat: number; lng: number } | null>(null);
  const [radius, setRadius] = useState(25);
  const [mode, setMode] = useState<"include" | "exclude">("include");
  const reverse = useReverseGeocode();
  const addArea = useAddArea();

  const handleMapClick = (lat: number, lng: number) => {
    reverse.mutate(
      { lat, lng },
      {
        onSuccess: (place) => {
          addArea.mutate({ ...place, radius_km: radius, mode });
          setFocus({ lat, lng });
        },
      },
    );
  };

  return (
    <div className="om-anim-rise space-y-3">
      <SectionHeading
        title="Geo Targeting"
        subtitle="Define the places your posts, campaigns and broadcasts should reach"
        icon={<MapIcon />}
      />

      <GeoStats />

      {/* plain div, not <Card> — Card clips its overflow and would hide the
          search-results dropdown. High z so the dropdown wins over the Leaflet map. */}
      <div className="relative z-[1000] rounded-xl border border-om-border bg-om-card p-2.5">
        <PlaceSearch
          onPick={(r) => setFocus({ lat: r.lat, lng: r.lng })}
          radius={radius}
          mode={mode}
          onRadiusChange={setRadius}
          onModeChange={setMode}
        />
        <p className="mt-1.5 text-[10px] text-om-faint">
          Or click anywhere on the map to add that spot directly, using the radius and include/exclude
          setting above.
        </p>
      </div>

      <div className="relative z-0 grid gap-3 lg:grid-cols-[1fr_320px]">
        <Card noEdge className="overflow-hidden p-0">
          <div className="h-[460px] w-full">
            <MapCanvas
              areas={data?.items ?? []}
              focus={focus}
              onMapClick={handleMapClick}
              pending={reverse.isPending || addArea.isPending}
            />
          </div>
        </Card>
        <AreaList onFocus={(a) => setFocus({ lat: a.lat, lng: a.lng })} />
      </div>
    </div>
  );
}
