import { bearerHash, json } from "@/features/device/http";
import { callJsonFn, query } from "@/lib/db";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

interface Claimed { status?: string; command: null | { id: string; type: string; payload: Record<string, unknown> } }

// Device polls for its next command (marks it DELIVERED). For OTA_INSTALL the private firmware
// is exposed only as a short-lived signed URL minted here, at delivery time (never stored).
export async function GET(req: Request) {
  const hash = bearerHash(req);
  if (!hash) return json({ error: "unauthorized" }, 401);
  const r = await callJsonFn<Claimed | null>("select public.claim_next_command($1) as r", [hash]);
  if (r && r.status === "unauthorized") return json({ error: "unauthorized" }, 401);

  if (r?.command?.type === "OTA_INSTALL") {
    const rows = await query<{ storage_bucket: string; storage_object_key: string }>(
      "select storage_bucket, storage_object_key from public.ota_releases where id = $1",
      [r.command.payload.release_id],
    );
    if (rows[0]) {
      const { data } = await createSupabaseServiceClient().storage
        .from(rows[0].storage_bucket).createSignedUrl(rows[0].storage_object_key, 900);
      if (data) r.command.payload = { ...r.command.payload, url: data.signedUrl, url_expires_in_s: 900 };
    }
  }
  return json(r);
}
