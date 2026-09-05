"use client";

import { useEffect, useRef, useState } from "react";
import { Search, MapPin, Plus, Loader2 } from "lucide-react";
import { usePlaceSearch, useAddArea } from "./hooks";
import type { GeoResult } from "@/lib/api/geo";

export function PlaceSearch({
  onPick,
  radius,
  mode,
  onRadiusChange,
  onModeChange,
}: {
  onPick?: (r: GeoResult) => void;
  radius: number;
  mode: "include" | "exclude";
  onRadiusChange: (r: number) => void;
  onModeChange: (m: "include" | "exclude") => void;
}) {
  const [term, setTerm] = useState("");
  const [debounced, setDebounced] = useState("");
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  const { data, isFetching } = usePlaceSearch(debounced);
  const add = useAddArea();

  useEffect(() => {
    const t = setTimeout(() => setDebounced(term), 350);
    return () => clearTimeout(t);
  }, [term]);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const pick = (r: GeoResult) => {
    onPick?.(r);
    add.mutate({ ...r, radius_km: radius, mode });
    setTerm("");
    setOpen(false);
  };

  return (
    <div className="flex flex-wrap items-center gap-2" ref={boxRef}>
      <div className="relative min-w-[240px] flex-1">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-om-muted" />
        <input
          value={term}
          onChange={(e) => {
            setTerm(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Search a city, region or country…"
          className="w-full rounded-lg border border-om-border bg-white/[0.03] py-1.5 pl-8 pr-8 text-[12px] text-om-text outline-none placeholder:text-om-muted focus:border-om-blue/60 focus:ring-2 focus:ring-om-blue/15"
        />
        {isFetching && (
          <Loader2 className="absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 animate-spin text-om-muted" />
        )}
        {open && debounced.length >= 2 && (data?.results.length ?? 0) > 0 && (
          <div className="absolute z-30 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-om-border bg-om-bg2 p-1 shadow-2xl">
            {data!.results.map((r, i) => (
              <button
                key={`${r.osm_id}-${i}`}
                onClick={() => pick(r)}
                className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-white/[0.05]"
              >
                <MapPin className="mt-0.5 size-3.5 shrink-0 text-om-blue" />
                <span className="min-w-0">
                  <span className="block truncate text-[12px] font-medium">{r.label}</span>
                  <span className="block truncate text-[10.5px] text-om-muted">{r.display_name}</span>
                </span>
                <Plus className="ml-auto mt-0.5 size-3.5 shrink-0 text-om-muted" />
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center gap-1 rounded-lg border border-om-border bg-white/[0.02] p-0.5">
        {(["include", "exclude"] as const).map((m) => (
          <button
            key={m}
            onClick={() => onModeChange(m)}
            className={`rounded-md px-2 py-1 text-[11px] font-medium capitalize transition-colors ${
              mode === m
                ? m === "include"
                  ? "bg-om-blue/15 text-om-blue"
                  : "bg-om-red/15 text-om-red"
                : "text-om-muted"
            }`}
          >
            {m}
          </button>
        ))}
      </div>

      <label className="flex items-center gap-2 text-[11px] text-om-muted">
        <span className="whitespace-nowrap">Radius {radius} km</span>
        <input
          type="range"
          min={1}
          max={200}
          value={radius}
          onChange={(e) => onRadiusChange(Number(e.target.value))}
          className="w-28 accent-om-blue"
        />
      </label>
    </div>
  );
}
