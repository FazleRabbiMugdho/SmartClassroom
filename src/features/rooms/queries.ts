import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getWeather, type WeatherView } from "@/features/weather/queries";

// All reads use the user's RLS-bound client: scope is enforced by the database,
// so a room outside the caller's scope simply returns nothing.

export interface RoomRef { id: string; display_name: string; room_code: string; capacity: number | null }
export interface TelemetryRow {
  device_ts: string; received_at: string; seq: number;
  temp_c: number; rh: number; heat_index_c: number; heat_trend: string;
  flame: boolean; door: "LOCKED" | "UNLOCKED"; status: "SAFE" | "WARNING" | "DANGER" | "FIRE";
  quality: "good" | "bad"; rssi: number; fw: string;
}
export interface EventRow {
  id: string; event_type: string; source: string; device_ts: string | null;
  received_at: string; is_offline_sync: boolean; detail: Record<string, unknown>;
}
export interface HealthRow {
  received_at: string; uptime_s: number; rssi: number; free_heap_kb: number;
  chip_temp_c: number; fw: string; reset_reason: string;
}
export interface IncidentRow { id: string; incident_type: string; state: string; occurred_at: string; severity: string }
export interface RoomSnapshot {
  room: RoomRef | null;
  device: { id: string; device_code: string; firmware_version: string | null; last_seen_at: string | null } | null;
  latest: TelemetryRow | null;
  series: Pick<TelemetryRow, "device_ts" | "temp_c" | "rh" | "heat_index_c" | "quality">[];
  events: EventRow[];
  health: HealthRow | null;
  incidents: IncidentRow[];
  attendance: { title: string; starts_at: string; enrolled: number; present: number; late: number; absent: number } | null;
  weather: Pick<WeatherView, "current" | "stale" | "ageSeconds">;
  serverNow: number;
}

export async function listRooms(): Promise<RoomRef[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("rooms").select("id, display_name, room_code, capacity").order("display_name");
  return (data ?? []) as RoomRef[];
}

export async function getRoomSnapshot(roomId: string, minutes = 60): Promise<RoomSnapshot> {
  const supabase = await createSupabaseServerClient();
  const serverNow = Date.now();
  const since = new Date(serverNow - minutes * 60_000).toISOString();

  const { data: room } = await supabase.from("rooms").select("id, display_name, room_code, capacity").eq("id", roomId).maybeSingle();
  if (!room) {
    return { room: null, device: null, latest: null, series: [], events: [], health: null, incidents: [], attendance: null, weather: { current: null, stale: false, ageSeconds: null }, serverNow };
  }

  const { data: device } = await supabase
    .from("devices").select("id, device_code, firmware_version, last_seen_at").eq("room_id", roomId).limit(1).maybeSingle();

  const [latest, series, events, health, incidents, cls] = await Promise.all([
    supabase.from("telemetry_readings")
      .select("device_ts, received_at, seq, temp_c, rh, heat_index_c, heat_trend, flame, door, status, quality, rssi, fw")
      .eq("room_id", roomId).order("device_ts", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("telemetry_readings")
      .select("device_ts, temp_c, rh, heat_index_c, quality")
      .eq("room_id", roomId).gte("device_ts", since).order("device_ts", { ascending: true }).limit(1000),
    supabase.from("device_events")
      .select("id, event_type, source, device_ts, received_at, is_offline_sync, detail")
      .eq("room_id", roomId).order("received_at", { ascending: false }).limit(20),
    device
      ? supabase.from("device_health_snapshots")
          .select("received_at, uptime_s, rssi, free_heap_kb, chip_temp_c, fw, reset_reason")
          .eq("device_id", device.id).order("received_at", { ascending: false }).limit(1).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from("security_incidents")
      .select("id, incident_type, state, occurred_at, severity")
      .eq("room_id", roomId).neq("state", "CLOSED").order("occurred_at", { ascending: false }).limit(10),
    supabase.from("class_sessions").select("id, title, starts_at")
      .eq("room_id", roomId).lte("starts_at", new Date(serverNow).toISOString()).gt("ends_at", new Date(serverNow).toISOString())
      .limit(1).maybeSingle(),
  ]);

  let attendance: RoomSnapshot["attendance"] = null;
  if (cls.data) {
    const [enr, att] = await Promise.all([
      supabase.from("class_enrollments").select("id", { count: "exact", head: true }).eq("class_session_id", cls.data.id),
      supabase.from("attendance_records").select("attendance_status").eq("class_session_id", cls.data.id),
    ]);
    const rows = (att.data ?? []) as { attendance_status: string }[];
    attendance = {
      title: cls.data.title,
      starts_at: cls.data.starts_at,
      enrolled: enr.count ?? 0,
      present: rows.filter((r) => r.attendance_status === "PRESENT").length,
      late: rows.filter((r) => r.attendance_status === "LATE").length,
      absent: rows.filter((r) => r.attendance_status === "ABSENT").length,
    };
  }

  const w = await getWeather(serverNow);
  return {
    room: room as RoomRef,
    device: device ?? null,
    latest: (latest.data as TelemetryRow | null) ?? null,
    series: (series.data ?? []) as RoomSnapshot["series"],
    events: (events.data ?? []) as EventRow[],
    health: (health.data as HealthRow | null) ?? null,
    incidents: (incidents.data ?? []) as IncidentRow[],
    attendance,
    weather: { current: w.current, stale: w.stale, ageSeconds: w.ageSeconds },
    serverNow,
  };
}
