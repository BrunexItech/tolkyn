"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AXIS_TICK, CHART_GRID, CHART_LEGEND, TOOLTIP_STYLE } from "./chartTheme";

export interface TrendSeries {
  key: string;
  color: string;
  name?: string;
  fill?: boolean;
}

interface AreaTrendProps {
  data: Array<Record<string, string | number>>;
  series: TrendSeries[];
  xKey?: string;
  height?: number;
  legend?: boolean;
  yTickFormatter?: (v: number) => string;
}

export function AreaTrend({
  data,
  series,
  xKey = "name",
  height = 150,
  legend = true,
  yTickFormatter,
}: AreaTrendProps) {
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
          <defs>
            {series.map((s) => (
              <linearGradient key={s.key} id={`omfill-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={s.color} stopOpacity={0.22} />
                <stop offset="100%" stopColor={s.color} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid stroke={CHART_GRID} vertical={false} />
          <XAxis dataKey={xKey} tick={AXIS_TICK} axisLine={false} tickLine={false} />
          <YAxis
            tick={AXIS_TICK}
            axisLine={false}
            tickLine={false}
            width={44}
            tickFormatter={yTickFormatter}
          />
          <Tooltip contentStyle={TOOLTIP_STYLE} />
          {legend && <Legend wrapperStyle={{ fontSize: 9.5, color: CHART_LEGEND }} iconSize={9} />}
          {series.map((s) => (
            <Area
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.name ?? s.key}
              stroke={s.color}
              strokeWidth={2}
              fill={s.fill === false ? "transparent" : `url(#omfill-${s.key})`}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
