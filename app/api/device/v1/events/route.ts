import { after } from "next/server";
import { eventWire } from "@/features/device/schemas";
import { bearerHash, parseBody, mapStatus, json } from "@/features/device/http";
import { callJsonFn, query } from "@/lib/db";
import { deliverPending } from "@/features/notifications/deliver";

const PHONE_WORTHY = new Set(["FIRE", "PANIC"]);

export async function POST(req: Request) {
  const hash = bearerHash(req);
  if (!hash) return json({ error: "unauthorized" }, 401);
  const parsed = await parseBody(req, eventWire);
  if ("error" in parsed) return parsed.error;
  const r = await callJsonFn<{ status?: string }>("select public.ingest_event($1, $2::jsonb) as r", [hash, JSON.stringify(parsed.data)]);

  if (r?.status === "accepted") {
    // A fresh CARD_TAP may complete an Admin "Register card" operation for this reader.
    const uid = (parsed.data.detail as { uid?: unknown }).uid;
    if (parsed.data.type === "CARD_TAP" && typeof uid === "string") {
      await query(
        "select public.complete_card_registration((select device_id from public.device_from_token($1)), $2)",
        [hash, uid],
      );
    }
    // FIRE/PANIC: the incident + in-app notifications were created by DB triggers in the same
    // transaction; push to the phone right after the response so the device is not kept waiting.
    if (PHONE_WORTHY.has(parsed.data.type)) after(() => deliverPending().catch(() => undefined));
  }
  return mapStatus(r);
}
