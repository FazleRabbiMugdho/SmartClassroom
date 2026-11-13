import { timingSafeEqual } from "node:crypto";
import { callJsonFn } from "@/lib/db";
import { evaluationInput, validateEvaluation } from "@/features/models/evaluation";

// The training/evaluation script (kept in the repo) posts its REAL held-out results here.
// Authenticated by MODEL_INGEST_TOKEN (server secret). The validator + DB constraints refuse
// inconsistent numbers, so an evaluation page can never show fabricated accuracy.
export async function POST(req: Request) {
  const secret = process.env.MODEL_INGEST_TOKEN;
  const given = (req.headers.get("authorization") ?? "").replace(/^Bearer /, "");
  const ok = !!secret && given.length === secret.length && timingSafeEqual(Buffer.from(given), Buffer.from(secret));
  if (!ok) return Response.json({ error: "unauthorized" }, { status: 401 });

  const body = evaluationInput.safeParse(await req.json().catch(() => null));
  if (!body.success) return Response.json({ error: "invalid_payload", issues: body.error.issues }, { status: 422 });
  const verdict = validateEvaluation(body.data);
  if (!verdict.ok) return Response.json({ error: "inconsistent_evaluation", detail: verdict.error }, { status: 422 });

  try {
    const id = await callJsonFn<string>("select to_jsonb(public.record_model_evaluation($1::jsonb)) as r", [JSON.stringify(body.data)]);
    return Response.json({ status: "recorded", model_run_id: id });
  } catch (e) {
    return Response.json({ error: "rejected_by_database", detail: e instanceof Error ? e.message : "constraint violated" }, { status: 422 });
  }
}
