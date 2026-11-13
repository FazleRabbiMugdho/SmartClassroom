import { after } from "next/server";
import { telemetryWire } from "@/features/device/schemas";
import { bearerHash, parseBody, mapStatus, json } from "@/features/device/http";
import { callJsonFn } from "@/lib/db";
import { deliverPending } from "@/features/notifications/deliver";

export async function POST(req: Request) {
  const hash = bearerHash(req);
  if (!hash) return json({ error: "unauthorized" }, 401);
  const parsed = await parseBody(req, telemetryWire);
  if ("error" in parsed) return parsed.error;
  const r = await callJsonFn<{ status?: string }>("select public.ingest_telemetry($1, $2::jsonb) as r", [hash, JSON.stringify(parsed.data)]);
  // A DANGER reading may have raised a Heat Danger incident (DB trigger): notify the phone now.
  if (r?.status === "accepted" && parsed.data.status === "DANGER") after(() => deliverPending().catch(() => undefined));
  return mapStatus(r);
}
