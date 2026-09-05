"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AXIS_TICK, CHART_GRID, CHART_LEGEND, TOOLTIP_STYLE } from "./chartTheme";

export interface BarSeries {
  key: string;
  color: string;
  stackId?: string;
  name?: string;
}

interface BarBreakdownProps {
  data: Array<Record<string, string | number>>;
  series: BarSeries[];
  xKey?: string;
  height?: number;
  legend?: boolean;
  yTickFormatter?: (v: number) => string;
  layout?: "horizontal" | "vertical";
}

export function BarBreakdown({
  data,
  series,
  xKey = "name",
  height = 150,
  legend = true,
  yTickFormatter,
  layout = "horizontal",
}: BarBreakdownProps) {
  const vertical = layout === "vertical";
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout={layout}
          margin={{ top: 4, right: 8, bottom: 0, left: vertical ? 4 : -16 }}
        >
          <CartesianGrid stroke={CHART_GRID} vertical={vertical} horizontal={!vertical} />
          {vertical ? (
            <>
              <XAxis type="number" tick={AXIS_TICK} axisLine={false} tickLine={false} tickFormatter={yTickFormatter} />
              <YAxis type="category" dataKey={xKey} tick={AXIS_TICK} axisLine={false} tickLine={false} width={64} />
            </>
          ) : (
            <>
              <XAxis dataKey={xKey} tick={AXIS_TICK} axisLine={false} tickLine={false} />
              <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={44} tickFormatter={yTickFormatter} />
            </>
          )}
          <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "rgba(79,122,255,.06)" }} />
          {legend && <Legend wrapperStyle={{ fontSize: 9.5, color: CHART_LEGEND }} iconSize={9} />}
          {series.map((s) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.name ?? s.key}
              stackId={s.stackId}
              fill={s.color}
              radius={vertical ? [0, 3, 3, 0] : [3, 3, 0, 0]}
              maxBarSize={vertical ? 14 : 34}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
