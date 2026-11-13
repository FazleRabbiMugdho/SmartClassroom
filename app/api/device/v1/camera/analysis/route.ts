import { cameraAnalysis } from "@/features/device/schemas";
import { bearerHash, parseBody, json } from "@/features/device/http";
import { callJsonFn, query } from "@/lib/db";
import { occupiedSeats, parsePolygon, type Zone } from "@/features/vision/geometry";
import { savePrivateSnapshot } from "@/server/storage/snapshots";

interface Applied { status: string; emitted: string[]; needs_snapshot: null | { kind: "INTRUDER" | "CAMERA_FAULT"; incident_id: string; health_event_id?: number } }

// Levels 9/10. The provider supplies person boxes, tamper scores and hand predictions; the SERVER
// turns them into seat occupancy (centre-in-zone), 3 s holds, capacity/intruder/fault events and
// once-per-raise hand events (SQL apply_vision_sample). Frames are never stored: at most ONE
// optional JPEG is kept, and only when it becomes the INTRUDER or camera-fault snapshot.
export async function POST(req: Request) {
  const hash = bearerHash(req);
  if (!hash) return json({ error: "unauthorized" }, 401);
  const parsed = await parseBody(req, cameraAnalysis);
  if ("error" in parsed) return parsed.error;
  const b = parsed.data;

  const dev = await query<{ device_id: string; room_id: string; device_code: string }>("select * from public.device_from_token($1)", [hash]);
  if (!dev[0]) return json({ error: "unauthorized" }, 401);
  if (dev[0].device_code !== b.device_id) return json({ error: "device_mismatch" }, 409);

  const rows = await query<{ seat_no: number; polygon: unknown }>("select seat_no, polygon from public.seat_zones where room_id = $1", [dev[0].room_id]);
  const zones: Zone[] = rows.flatMap((r) => {
    const poly = parsePolygon(r.polygon);
    return poly ? [{ seat_no: r.seat_no, polygon: poly }] : [];
  });

  const result = await callJsonFn<Applied>("select public.apply_vision_sample($1, $2::jsonb) as r", [
    dev[0].device_id,
    JSON.stringify({
      position: b.position, person_count: b.persons.length, occupied_seats: occupiedSeats(b.persons, zones),
      boxes: b.persons, fps: b.fps, model_version: b.model_version, tamper: b.tamper, hands: b.hands, synthetic: b.synthetic ?? false,
    }),
  ]);

  if (result.needs_snapshot && b.snapshot_b64) {
    const snapId = await savePrivateSnapshot({ deviceId: dev[0].device_id, kind: result.needs_snapshot.kind, b64: b.snapshot_b64 });
    if (snapId) await query("select public.attach_snapshot($1, $2, $3)", [result.needs_snapshot.incident_id, snapId, result.needs_snapshot.health_event_id ?? null]);
  }
  return json({ status: "accepted", stored_frame: false, emitted: result.emitted });
}
