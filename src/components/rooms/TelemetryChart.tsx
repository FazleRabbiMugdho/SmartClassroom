"use client";

import { useMemo } from "react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { buildSeries } from "@/features/rooms/derive";
import type { RoomSnapshot } from "@/features/rooms/queries";

const fmt = (t: number) =>
  new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Dhaka" }).format(new Date(t));

export function TelemetryChart({ series }: { series: RoomSnapshot["series"] }) {
  const data = useMemo(
    () => buildSeries(series.map((r) => ({ ...r, temp_c: Number(r.temp_c), rh: Number(r.rh), heat_index_c: Number(r.heat_index_c) }))),
    [series],
  );

  if (data.filter((d) => d.temp !== null).length === 0) {
    return <p className="py-10 text-center text-sm text-muted">No stored readings in this period.</p>;
  }

  return (
    <div className="h-64 w-full" role="img" aria-label="Temperature, humidity and heat index over time">
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
          <CartesianGrid stroke="#E2E8F0" vertical={false} />
          <XAxis dataKey="t" type="number" scale="time" domain={["dataMin", "dataMax"]} tickFormatter={fmt} stroke="#94A3B8" fontSize={11} tickLine={false} />
          <YAxis stroke="#94A3B8" fontSize={11} tickLine={false} axisLine={false} />
          <Tooltip labelFormatter={(t) => fmt(Number(t))} contentStyle={{ borderRadius: 10, border: "1px solid #E2E8F0", fontSize: 12 }} />
          <Legend iconType="plainline" wrapperStyle={{ fontSize: 12 }} />
          {/* connectNulls=false: gaps stay gaps, never interpolated */}
          <Line name="Temp °C" dataKey="temp" stroke="#F97316" strokeWidth={2} dot={false} connectNulls={false} isAnimationActive={false} />
          <Line name="Humidity %" dataKey="rh" stroke="#4F46E5" strokeWidth={2} dot={false} connectNulls={false} isAnimationActive={false} />
          <Line name="Heat index °C" dataKey="hi" stroke="#E11D48" strokeWidth={1.5} strokeDasharray="4 3" dot={false} connectNulls={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
