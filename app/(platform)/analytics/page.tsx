import { cookies } from "next/headers";
import { BarChart3 } from "lucide-react";
import { labelsFor, resolveLocale } from "@/i18n/dictionaries";
import { pageRole, STAFF } from "@/server/auth/guard";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { listRooms } from "@/features/rooms/queries";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Select, Field } from "@/components/ui/Input";
import { EmptyState } from "@/components/ui/EmptyState";
import { TelemetryChart } from "@/components/rooms/TelemetryChart";

// Stored telemetry for a chosen period up to the last 24 h. The window is fixed at render time
// and passed to the CSV link verbatim, so the chart and the export always cover the same readings.
export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<{ room?: string; hours?: string }> }) {
  await pageRole(STAFF);
  const sp = await searchParams;
  const locale = resolveLocale((await cookies()).get("locale")?.value);
  const L = labelsFor(locale, "an");
  const H = labelsFor(locale, "hist");

  const rooms = await listRooms();
  if (rooms.length === 0) return <EmptyState icon={BarChart3} title={L.title} />;
  const room = rooms.find((r) => r.id === sp.room) ?? rooms[0];
  const hours = [1, 6, 12, 24].includes(Number(sp.hours)) ? Number(sp.hours) : 6;

  const to = Date.now();
  const from = to - hours * 3_600_000;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("telemetry_readings")
    .select("device_ts, temp_c, rh, heat_index_c, quality")
    .eq("room_id", room.id).gte("device_ts", new Date(from).toISOString()).lt("device_ts", new Date(to).toISOString())
    .order("device_ts", { ascending: true }).limit(5000);
  const series = (data ?? []) as { device_ts: string; temp_c: number; rh: number; heat_index_c: number; quality: "good" | "bad" }[];

  const csv = new URLSearchParams({ room: room.id, from: new Date(from).toISOString(), to: new Date(to).toISOString() }).toString();

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <h1 className="text-2xl font-semibold tracking-[-0.02em]">{L.title}</h1>
      <Card>
        <form method="get" className="grid items-end gap-3 sm:grid-cols-3">
          <Field label={L.room} htmlFor="room"><Select id="room" name="room" defaultValue={room.id}>{rooms.map((r) => <option key={r.id} value={r.id}>{r.display_name}</option>)}</Select></Field>
          <Field label={`${L.period} (${L.hours})`} htmlFor="hours"><Select id="hours" name="hours" defaultValue={String(hours)}>{[1, 6, 12, 24].map((h) => <option key={h} value={h}>{h}</option>)}</Select></Field>
          <div className="flex gap-2">
            <Button type="submit" size="sm">{H.apply}</Button>
            <a href={`/api/export/readings?${csv}`} className="inline-flex h-8 items-center rounded-lg border border-border bg-card px-3 text-[13px] font-medium hover:bg-canvas">{H.readings}</a>
          </div>
        </form>
      </Card>
      <Card><TelemetryChart series={series} /></Card>
    </div>
  );
}
