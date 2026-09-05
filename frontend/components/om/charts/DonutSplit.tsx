"use client";

import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { CHART_LEGEND, OM_SERIES, TOOLTIP_STYLE } from "./chartTheme";

export interface DonutSlice {
  name: string;
  value: number;
  color?: string;
}

interface DonutSplitProps {
  data: DonutSlice[];
  height?: number;
  legend?: boolean;
}

export function DonutSplit({ data, height = 150, legend = true }: DonutSplitProps) {
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius="58%"
            outerRadius="86%"
            paddingAngle={2}
            stroke="transparent"
          >
            {data.map((d, i) => (
              <Cell key={d.name} fill={d.color ?? OM_SERIES[i % OM_SERIES.length]} />
            ))}
          </Pie>
          <Tooltip contentStyle={TOOLTIP_STYLE} />
          {legend && (
            <Legend
              layout="vertical"
              align="right"
              verticalAlign="middle"
              wrapperStyle={{ fontSize: 9.5, color: CHART_LEGEND }}
              iconSize={9}
            />
          )}
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
