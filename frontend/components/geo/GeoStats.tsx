"use client";

import { Target, Globe2, UsersRound, Ban } from "lucide-react";
import { Grid } from "@/components/om/primitives/Grid";
import { StatTile } from "@/components/om/primitives/StatTile";
import { useGeoSummary } from "./hooks";
import { compact } from "@/lib/om/format";

export function GeoStats() {
  const { data: s } = useGeoSummary();
  return (
    <Grid cols={4}>
      <StatTile label="Target areas" value={s?.includes ?? "—"} icon={<Target />} color="var(--om-blue)" />
      <StatTile label="Exclusions" value={s?.excludes ?? "—"} icon={<Ban />} color="var(--om-red)" />
      <StatTile
        label="Countries"
        value={s?.countries.length ?? "—"}
        icon={<Globe2 />}
        color="var(--om-cyan)"
      />
      <StatTile
        label="Est. reach"
        value={s ? compact(s.estimated_reach) : "—"}
        icon={<UsersRound />}
        color="var(--om-green)"
      />
    </Grid>
  );
}
