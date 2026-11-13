import { csiBatch } from "@/features/device/schemas";
import { bearerHash, parseBody, json } from "@/features/device/http";
import { callJsonFn, query } from "@/lib/db";

// Level 11. Stats, labelled collection (deterministic 25% held-out split, lens must be declared
// covered) and live predictions all go through one SQL function. CSI-only: a prediction carrying
// camera data is rejected both by the strict schema and by the database.
export async function POST(req: Request) {
  const hash = bearerHash(req);
  if (!hash) return json({ error: "unauthorized" }, 401);
  const parsed = await parseBody(req, csiBatch);
  if ("error" in parsed) return parsed.error;

  const dev = await query<{ device_code: string }>("select device_code from public.device_from_token($1)", [hash]);
  if (!dev[0]) return json({ error: "unauthorized" }, 401);
  if (dev[0].device_code !== parsed.data.device_id) return json({ error: "device_mismatch" }, 409);

  const r = await callJsonFn<{ status: string; reason?: string }>("select public.ingest_csi_batch($1, $2::jsonb) as r", [hash, JSON.stringify(parsed.data)]);
  return json(r, r.status === "rejected" ? 422 : 200);
}
