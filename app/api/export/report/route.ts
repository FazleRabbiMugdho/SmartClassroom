import { requireStaffApi } from "@/server/auth/api";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { csvResponse, toCsv } from "@/lib/csv";
import type { Report } from "@/features/assistant/assistant";

// Daily report CSV: the same SQL function (RLS-invoker) as the page and the assistant.
export async function GET(req: Request) {
  const gate = await requireStaffApi();
  if (gate instanceof Response) return gate;

  const sp = new URL(req.url).searchParams;
  const room = sp.get("room");
  const date = sp.get("date");
  if (!room || !date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return Response.json({ error: "room and date (YYYY-MM-DD) required" }, { status: 400 });

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("daily_report", { p_room: room, p_date: date });
  if (error || !data) return Response.json({ error: "query_failed" }, { status: 500 });
  const r = data as Report;

  const rows: (string | number | null)[][] = [
    ["date", r.date], ["timezone", "Asia/Dhaka"], ["accepted_readings", r.readings],
    ["temp_min_c", r.temp_c?.min ?? null], ["temp_max_c", r.temp_c?.max ?? null], ["temp_avg_c", r.temp_c?.avg ?? null],
    ["rh_min", r.rh?.min ?? null], ["rh_max", r.rh?.max ?? null], ["rh_avg", r.rh?.avg ?? null],
    ...Object.entries(r.alarms).map(([k, v]) => [`alarms_${k.toLowerCase()}`, v] as (string | number)[]),
    ["attendance_present", r.attendance.present], ["attendance_late", r.attendance.late], ["attendance_absent", r.attendance.absent],
  ];
  return csvResponse(`daily-report-${date}.csv`, toCsv(["metric", "value"], rows));
}
