import { requireStaffApi } from "@/server/auth/api";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { applyPlan, eventFilterPlan, eventSeverity, parseEventFilters, EXPORT_LIMIT } from "@/features/history/filters";
import { csvResponse, toCsv } from "@/lib/csv";

// Same filter plan as the history page, so the CSV equals the filtered list. RLS scopes rooms.
export async function GET(req: Request) {
  const gate = await requireStaffApi();
  if (gate instanceof Response) return gate;

  const sp = Object.fromEntries(new URL(req.url).searchParams);
  const roomId = sp.room;
  if (!roomId) return Response.json({ error: "room required" }, { status: 400 });
  const filters = parseEventFilters(roomId, sp);

  const supabase = await createSupabaseServerClient();
  const q = applyPlan(
    supabase.from("device_events")
      .select("event_type, source, device_ts, received_at, is_offline_sync, detail, device:devices(device_code)")
      .order("received_at", { ascending: false }).limit(EXPORT_LIMIT),
    eventFilterPlan(filters),
  );
  const { data, error } = await q;
  if (error) return Response.json({ error: "query_failed" }, { status: 500 });

  type R = { event_type: string; source: string; device_ts: string | null; received_at: string; is_offline_sync: boolean; detail: unknown; device: { device_code: string } | null };
  const rows = ((data ?? []) as unknown as R[]).map((r) => [
    r.device_ts, r.received_at, r.event_type, eventSeverity(r.event_type), r.source, r.device?.device_code ?? "", r.is_offline_sync, JSON.stringify(r.detail ?? {}),
  ]);
  return csvResponse("events.csv", toCsv(["event_time_utc", "received_at_utc", "type", "severity", "source", "device", "offline_sync", "detail"], rows));
}
