"use client";

import { MapPin, Trash2, Target, Ban } from "lucide-react";
import { Card, CardTitle } from "@/components/om/primitives/Card";
import { EmptyState } from "@/components/om/primitives/EmptyState";
import { useAreas, useUpdateArea, useDeleteArea } from "./hooks";
import type { TargetArea } from "@/lib/api/geo";
import { cn } from "@/lib/utils";

export function AreaList({ onFocus }: { onFocus?: (a: TargetArea) => void }) {
  const { data, isLoading } = useAreas();
  const update = useUpdateArea();
  const del = useDeleteArea();
  const areas = data?.items ?? [];

  return (
    <Card>
      <CardTitle icon={<Target />}>
        Target areas {areas.length > 0 && <span className="text-om-muted">· {areas.length}</span>}
      </CardTitle>

      {isLoading ? (
        <EmptyState title="Loading…" />
      ) : areas.length === 0 ? (
        <EmptyState icon={<MapPin />} title="No areas yet">
          Search a place above to add your first target area.
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-2">
          {areas.map((a) => (
            <div
              key={a.id}
              className={cn(
                "rounded-lg border bg-white/[0.02] p-2.5",
                a.mode === "exclude" ? "border-om-red/20" : "border-om-border",
              )}
            >
              <div className="flex items-start gap-2">
                <button
                  onClick={() => onFocus?.(a)}
                  className="mt-0.5 shrink-0"
                  title="Show on map"
                >
                  {a.mode === "exclude" ? (
                    <Ban className="size-3.5 text-om-red" />
                  ) : (
                    <MapPin className="size-3.5 text-om-blue" />
                  )}
                </button>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12px] font-semibold">{a.label}</div>
                  <div className="truncate text-[10px] text-om-muted">
                    {[a.region, a.country].filter(Boolean).join(", ") || a.display_name}
                  </div>
                </div>
                <button
                  onClick={() => del.mutate(a.id)}
                  className="grid size-6 shrink-0 place-items-center rounded-md text-om-muted hover:bg-om-red/10 hover:text-om-red"
                >
                  <Trash2 className="size-3" />
                </button>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <input
                  type="range"
                  min={1}
                  max={200}
                  value={a.radius_km}
                  onChange={(e) => update.mutate({ id: a.id, radius_km: Number(e.target.value) })}
                  className="flex-1 accent-om-blue"
                />
                <span className="w-14 shrink-0 text-right font-mono text-[10.5px] text-om-dim">
                  {a.radius_km} km
                </span>
                <button
                  onClick={() =>
                    update.mutate({ id: a.id, mode: a.mode === "include" ? "exclude" : "include" })
                  }
                  className={cn(
                    "rounded-md px-1.5 py-0.5 text-[10px] font-semibold",
                    a.mode === "exclude"
                      ? "bg-om-red/15 text-om-red"
                      : "bg-om-blue/15 text-om-blue",
                  )}
                >
                  {a.mode}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
