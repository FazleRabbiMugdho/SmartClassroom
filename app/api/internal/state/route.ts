import { json } from "@/features/device/http";
import { query } from "@/lib/db";

// Dev read endpoint so the mock device can drive the smoke dashboard without hardware.
// shortcut: no auth/RLS here; Prompt 06 (M6) replaces this with role-scoped, RLS-protected
// BFF reads + Realtime subscriptions. Reads the latest DB rows written by ingestion.
export async function GET() {
  try {
    const [telemetry, events] = await Promise.all([
      query("select * from public.telemetry_readings order by received_at desc limit 1"),
      query(
        `select seq, event_type as type, extract(epoch from device_ts)::bigint as ts, device_id
         from public.device_events order by received_at desc limit 50`,
      ),
    ]);
    return json({ telemetry: telemetry[0] ?? null, events });
  } catch {
    return json({ telemetry: null, events: [], error: "db_unavailable" });
  }
}
