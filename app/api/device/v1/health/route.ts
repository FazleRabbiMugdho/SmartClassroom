import { healthReport } from "@/features/device/schemas";
import { bearerHash, parseBody, mapStatus, json } from "@/features/device/http";
import { callJsonFn } from "@/lib/db";

export async function POST(req: Request) {
  const hash = bearerHash(req);
  if (!hash) return json({ error: "unauthorized" }, 401);
  const parsed = await parseBody(req, healthReport);
  if ("error" in parsed) return parsed.error;
  const b = parsed.data;

  const r = await callJsonFn<{ status?: string }>("select public.ingest_health($1, $2::jsonb) as r", [hash, JSON.stringify(b)]);

  // Level 12 link status (AP, pending queue, BLE name...) is optional and stored verbatim.
  if (r?.status === "accepted" && (b.sync_state || b.ble_name || b.ap_active !== undefined || b.pending_records !== undefined)) {
    await callJsonFn("select public.ingest_link_status($1, $2::jsonb) as r", [
      hash,
      JSON.stringify({
        sync_state: b.sync_state, ap_active: b.ap_active, pending_records: b.pending_records,
        oldest_pending_ts: b.oldest_pending_ts ? new Date(b.oldest_pending_ts * 1000).toISOString() : null,
        ble_name: b.ble_name, local_ip: b.local_ip, mdns_name: b.mdns_name, last_error: b.last_error,
      }),
    ]);
  }
  return mapStatus(r);
}
