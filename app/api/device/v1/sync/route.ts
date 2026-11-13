import { offlineBatch } from "@/features/device/schemas";
import { bearerHash, parseBody, json } from "@/features/device/http";
import { callJsonFn } from "@/lib/db";

export async function POST(req: Request) {
  const hash = bearerHash(req);
  if (!hash) return json({ error: "unauthorized" }, 401);
  const parsed = await parseBody(req, offlineBatch);
  if ("error" in parsed) return parsed.error;

  const results = await callJsonFn<{ status: string }[]>("select public.ingest_batch($1, $2::jsonb) as r", [hash, JSON.stringify(parsed.data.records)]);

  // Recovery dashboard evidence: how many records were new / duplicate / rejected, and the original time span.
  const ts = parsed.data.records.map((r) => r.ts);
  await callJsonFn("select public.record_sync_batch($1, $2::jsonb, $3, $4) as r", [
    hash, JSON.stringify(results), new Date(Math.min(...ts) * 1000).toISOString(), new Date(Math.max(...ts) * 1000).toISOString(),
  ]).catch(() => undefined); // bookkeeping must never fail the sync itself
  return json({ results });
}
