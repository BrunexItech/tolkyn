/** Shared styling for the dark Tolkyn Recharts wrappers. */

export const CHART_GRID = "rgba(86,118,214,.07)";
export const CHART_TICK = "rgba(230,236,251,.42)";
export const CHART_LEGEND = "rgba(230,236,251,.55)";

export const AXIS_TICK = { fill: CHART_TICK, fontSize: 9.5 } as const;

export const OM_SERIES = ["#4f7aff", "#22d3ee", "#22c55e", "#f5b642", "#8b7bf0", "#f472b6"];

export const TOOLTIP_STYLE = {
  background: "#0a1020",
  border: "1px solid rgba(86,118,214,.28)",
  borderRadius: 8,
  fontSize: 11,
  color: "#e6ecfb",
} as const;
