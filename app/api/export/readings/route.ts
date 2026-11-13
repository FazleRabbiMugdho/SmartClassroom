import { requireStaffApi } from "@/server/auth/api";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { csvResponse, toCsv } from "@/lib/csv";
import { EXPORT_LIMIT } from "@/features/history/filters";

// Readings for the exact [from, to) window the analytics chart showed. The window is capped at
// 24 h (Level 6) and must be passed explicitly so chart and CSV can never drift apart.
export async function GET(req: Request) {
  const gate = await requireStaffApi();
  if (gate instanceof Response) return gate;

  const sp = new URL(req.url).searchParams;
  const room = sp.get("room");
  const from = Date.parse(sp.get("from") ?? "");
  const to = Date.parse(sp.get("to") ?? "");
  if (!room || Number.isNaN(from) || Number.isNaN(to) || to <= from) return Response.json({ error: "room, from and to are required" }, { status: 400 });
  if (to - from > 24 * 3_600_000) return Response.json({ error: "period is limited to 24 hours" }, { status: 400 });

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("telemetry_readings")
    .select("device_ts, received_at, temp_c, rh, heat_index_c, quality")
    .eq("room_id", room).gte("device_ts", new Date(from).toISOString()).lt("device_ts", new Date(to).toISOString())
    .order("device_ts", { ascending: true }).limit(EXPORT_LIMIT);
  if (error) return Response.json({ error: "query_failed" }, { status: 500 });

  const rows = (data ?? []).map((r) => [r.device_ts, r.received_at, Number(r.temp_c), Number(r.rh), Number(r.heat_index_c), r.quality]);
  return csvResponse("readings.csv", toCsv(["device_time_utc", "received_at_utc", "temp_c", "rh_percent", "heat_index_c", "quality"], rows));
}
