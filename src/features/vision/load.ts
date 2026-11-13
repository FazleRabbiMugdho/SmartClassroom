import type { SupabaseClient } from "@supabase/supabase-js";
import { parsePolygon, type Pt } from "./geometry";
import { dhakaDate } from "@/features/assistant/assistant";

export interface VisionData {
  room: { capacity: number | null; night_mode: boolean };
  live: {
    position: "DOOR" | "ROOM" | null; person_count: number; stable_count: number; occupied_seats: number[]; stable_seats: number[];
    boxes: { x: number; y: number; w: number; h: number; confidence?: number }[]; fps: number | null; model_version: string | null; synthetic: boolean;
    cover_score: number | null; move_score: number | null; cover_threshold: number | null; move_threshold: number | null;
    tamper_state: "OK" | "COVERED" | "MOVED"; over_capacity: boolean; intruder_active: boolean; updated_at: string;
  } | null;
  camera: { selected_position: "DOOR" | "ROOM" | null; confirmed_position: "DOOR" | "ROOM" | null; selected_at: string | null; confirmed_at: string | null } | null;
  zones: { seat_no: number; label: string | null; polygon: Pt[] }[];
  raisesToday: Record<number, number>;
  recentRaises: { seat_no: number; occurred_at: string }[];
  incidents: { id: string; incident_type: string; state: string; occurred_at: string; snapshot_id: string | null }[];
  hasReference: { DOOR: boolean; ROOM: boolean };
}

// RLS-scoped: pass the caller's own client (server or browser). Nothing here bypasses scope.
export async function loadVision(s: SupabaseClient, roomId: string, nowMs = Date.now()): Promise<VisionData | null> {
  const dayStart = new Date(`${dhakaDate(nowMs)}T00:00:00+06:00`).toISOString();
  const { data: room } = await s.from("rooms").select("capacity, night_mode").eq("id", roomId).maybeSingle();
  if (!room) return null;

  const [live, camera, zones, raises, incidents, refs] = await Promise.all([
    s.from("room_vision_live").select("*").eq("room_id", roomId).maybeSingle(),
    s.from("room_camera_state").select("selected_position, confirmed_position, selected_at, confirmed_at").eq("room_id", roomId).maybeSingle(),
    s.from("seat_zones").select("seat_no, label, polygon").eq("room_id", roomId).order("seat_no"),
    s.from("handraise_events").select("seat_no, occurred_at").eq("room_id", roomId).gte("occurred_at", dayStart).order("occurred_at", { ascending: false }).limit(500),
    s.from("security_incidents").select("id, incident_type, state, occurred_at, snapshot_id").eq("room_id", roomId).in("incident_type", ["INTRUDER", "OVER_CAPACITY", "CAMERA_FAULT"]).neq("state", "CLOSED").order("occurred_at", { ascending: false }).limit(10),
    s.from("camera_positions").select("position").eq("room_id", roomId),
  ]);

  const raiseRows = (raises.data ?? []) as { seat_no: number; occurred_at: string }[];
  const perSeat: Record<number, number> = {};
  for (const r of raiseRows) perSeat[r.seat_no] = (perSeat[r.seat_no] ?? 0) + 1;
  const have = new Set(((refs.data ?? []) as { position: string }[]).map((r) => r.position));

  return {
    room: room as VisionData["room"],
    live: (live.data as VisionData["live"]) ?? null,
    camera: (camera.data as VisionData["camera"]) ?? null,
    zones: ((zones.data ?? []) as { seat_no: number; label: string | null; polygon: unknown }[]).flatMap((z) => {
      const p = parsePolygon(z.polygon);
      return p ? [{ seat_no: z.seat_no, label: z.label, polygon: p }] : [];
    }),
    raisesToday: perSeat,
    recentRaises: raiseRows.slice(0, 5),
    incidents: (incidents.data ?? []) as VisionData["incidents"],
    hasReference: { DOOR: have.has("DOOR"), ROOM: have.has("ROOM") },
  };
}
