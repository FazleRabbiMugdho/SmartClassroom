import { query } from "@/lib/db";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

// The ONLY places a camera image is ever persisted (all private, all time-limited):
//   MISMATCH (Level 8), INTRUDER (Level 9, one per episode), CAMERA_FAULT (Level 9, fault moment).
// Counting and live-view frames are never stored. Retention mirrors retention_policies.
export type SnapshotKind = "MISMATCH" | "INTRUDER" | "CAMERA_FAULT";
const RETENTION_DAYS: Record<SnapshotKind, number> = { MISMATCH: 30, INTRUDER: 30, CAMERA_FAULT: 7 };
const MAX_BYTES = 1_500_000;

export function decodeJpeg(b64: string): Buffer | null {
  const bytes = Buffer.from(b64, "base64");
  if (bytes.length < 4 || bytes.length > MAX_BYTES) return null;
  return bytes[0] === 0xff && bytes[1] === 0xd8 ? bytes : null; // JPEG SOI marker
}

/** Store one snapshot privately and return its metadata id, or null (best effort: the incident stands without it). */
export async function savePrivateSnapshot(opts: { deviceId: string; kind: SnapshotKind; b64: string; studentId?: string | null }): Promise<string | null> {
  try {
    const bytes = decodeJpeg(opts.b64);
    if (!bytes) return null;
    const dev = await query<{ room_id: string; school_id: string }>("select room_id, school_id from public.devices where id = $1", [opts.deviceId]);
    if (!dev[0]) return null;
    const key = `${opts.kind.toLowerCase()}/${dev[0].room_id}/${crypto.randomUUID()}.jpg`;
    const up = await createSupabaseServiceClient().storage.from("private-snapshots").upload(key, bytes, { contentType: "image/jpeg" });
    if (up.error) return null;
    const ins = await query<{ id: string }>(
      `insert into public.private_snapshots (school_id, room_id, kind, object_key, content_type, byte_size, student_id, expires_at)
       values ($1, $2, $3, $4, 'image/jpeg', $5, $6, now() + make_interval(days => $7)) returning id`,
      [dev[0].school_id, dev[0].room_id, opts.kind, key, bytes.length, opts.studentId ?? null, RETENTION_DAYS[opts.kind]],
    );
    return ins[0]?.id ?? null;
  } catch {
    return null;
  }
}
