"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";
import L from "leaflet";
import type { TargetArea } from "@/lib/api/geo";

interface MapCanvasProps {
  areas: TargetArea[];
  focus?: { lat: number; lng: number } | null;
  onMapClick?: (lat: number, lng: number) => void;
  pending?: boolean;
}

const INCLUDE = "#4f7aff";
const EXCLUDE = "#f0524b";

/**
 * Tile source. Defaults to Esri's Dark Gray Canvas — keyless, dark, no
 * watermark. Override with NEXT_PUBLIC_MAP_TILE_URL (+ optional
 * NEXT_PUBLIC_MAP_LABELS_URL) to use a keyed provider like Mapbox / Stadia.
 */
const BASE_URL =
  process.env.NEXT_PUBLIC_MAP_TILE_URL ||
  "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}";
const LABELS_URL =
  process.env.NEXT_PUBLIC_MAP_LABELS_URL ||
  (process.env.NEXT_PUBLIC_MAP_TILE_URL
    ? ""
    : "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}");
const MAX_ZOOM = 16;

export default function MapCanvas({ areas, focus, onMapClick, pending }: MapCanvasProps) {
  const elRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const onClickRef = useRef(onMapClick);
  onClickRef.current = onMapClick;

  useEffect(() => {
    if (!elRef.current || mapRef.current) return;
    const map = L.map(elRef.current, {
      center: [20, 0],
      zoom: 2,
      minZoom: 2,
      maxZoom: MAX_ZOOM,
      zoomControl: true,
      attributionControl: false,
      worldCopyJump: true,
    });
    L.tileLayer(BASE_URL, { maxZoom: MAX_ZOOM, crossOrigin: true }).addTo(map);
    if (LABELS_URL) {
      L.tileLayer(LABELS_URL, { maxZoom: MAX_ZOOM, crossOrigin: true }).addTo(map);
    }
    layerRef.current = L.layerGroup().addTo(map);
    map.on("click", (e) => onClickRef.current?.(e.latlng.lat, e.latlng.lng));
    mapRef.current = map;
    setTimeout(() => map.invalidateSize(), 50);

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // draw areas
  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    layer.clearLayers();
    const bounds: L.LatLngExpression[] = [];
    areas.forEach((a) => {
      const color = a.mode === "exclude" ? EXCLUDE : INCLUDE;
      L.circle([a.lat, a.lng], {
        radius: a.radius_km * 1000,
        color,
        weight: 1.5,
        fillColor: color,
        fillOpacity: 0.12,
      })
        .bindTooltip(`${a.label} · ${a.radius_km} km`, { direction: "top" })
        .addTo(layer);
      L.circleMarker([a.lat, a.lng], {
        radius: 4,
        color,
        fillColor: color,
        fillOpacity: 1,
        weight: 2,
      }).addTo(layer);
      bounds.push([a.lat, a.lng]);
    });
    if (bounds.length && mapRef.current) {
      mapRef.current.fitBounds(L.latLngBounds(bounds).pad(0.4), { maxZoom: 9, animate: true });
    }
  }, [areas]);

  // external focus
  useEffect(() => {
    if (focus && mapRef.current) {
      mapRef.current.setView([focus.lat, focus.lng], 9, { animate: true });
    }
  }, [focus]);

  return (
    <div className="relative h-full w-full">
      <div ref={elRef} className="h-full w-full cursor-crosshair" />
      {pending && (
        <div className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded-full border border-om-border bg-om-bg2/90 px-3 py-1 text-[10.5px] text-om-dim shadow-lg">
          Resolving location…
        </div>
      )}
    </div>
  );
}
