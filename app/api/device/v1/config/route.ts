import { bearerHash, json } from "@/features/device/http";
import { callJsonFn } from "@/lib/db";

export async function GET(req: Request) {
  const hash = bearerHash(req);
  if (!hash) return json({ error: "unauthorized" }, 401);
  const r = await callJsonFn<{ status?: string } | null>("select public.get_device_config($1) as r", [hash]);
  if (!r || r.status === "unauthorized") return json({ error: "unauthorized" }, 401);
  return json(r);
}
