import { faceVerifyRequest } from "@/features/device/schemas";
import { bearerHash, parseBody, json } from "@/features/device/http";
import { callJsonFn, query } from "@/lib/db";
import { matchFace, InferenceUnavailable } from "@/server/inference/face";
import { savePrivateSnapshot } from "@/server/storage/snapshots";

interface Decision {
  status: string;
  decision?: "GRANTED" | "DENIED";
  reason?: string;
  door?: "LOCKED" | "UNLOCKED";
  student_id?: string;
  device_id?: string;
}

const SQL =
  "select public.process_card_checkin($1, $2, to_timestamp($3), $4, $5, $6, $7) as r";

// Level 7/8 check-in. Two phases against SQL:
//   1) all non-face gates; if they pass we get NEED_FACE + the card owner.
//   2) face match via the inference adapter (never fabricated), then the final decision.
// The face crop is never stored, EXCEPT a private snapshot when the face does not match
// the card owner (Level 8). Inference unavailable => DENIED (fail closed, never grant).
export async function POST(req: Request) {
  const hash = bearerHash(req);
  if (!hash) return json({ error: "unauthorized" }, 401);
  const parsed = await parseBody(req, faceVerifyRequest);
  if ("error" in parsed) return parsed.error;
  const b = parsed.data;

  const pre = await callJsonFn<Decision>(SQL, [hash, b.card_uid, b.ts, null, b.crop_w, b.crop_h, null]);
  if (pre.status === "unauthorized") return json({ error: "unauthorized" }, 401);
  if (pre.status === "DECIDED") return json({ decision: pre.decision, reason: pre.reason, door: pre.door });

  // NEED_FACE: load the owner's embeddings (server-side only) and match.
  const rows = await query<{ embedding_b64: string }>(
    "select encode(embedding, 'base64') as embedding_b64 from public.face_embeddings where student_id = $1",
    [pre.student_id],
  );

  let face: "MATCH" | "MISMATCH" | "NO_FACE" | "SPOOF";
  try {
    face = rows.length ? (await matchFace(b.face_crop, rows.map((r) => r.embedding_b64))).result : "MISMATCH";
  } catch (e) {
    if (e instanceof InferenceUnavailable) {
      return json({ decision: "DENIED", reason: "NO_FACE", door: "LOCKED", detail: "inference_unavailable" }, 503);
    }
    throw e;
  }

  // Private snapshot only for a mismatch (Level 8). Stored in a private bucket, key only in DB.
  let snapshotId: string | null = null;
  if (face === "MISMATCH") snapshotId = await savePrivateSnapshot({ deviceId: pre.device_id!, kind: "MISMATCH", b64: b.face_crop, studentId: pre.student_id ?? null });

  const final = await callJsonFn<Decision>(SQL, [hash, b.card_uid, b.ts, face, b.crop_w, b.crop_h, snapshotId]);
  return json({ decision: final.decision, reason: final.reason, door: final.door });
}
