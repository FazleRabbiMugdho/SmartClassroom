import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface Evaluation {
  run: { id: string; version: string; features: string; training_code_ref: string | null; trained_at: string | null };
  accuracy: number; sampleCount: number; heldOutCount: number; labels: string[]; matrix: number[][];
  avgPredictionMs: number | null; presenceDelayMs: number | null; evaluatedAt: string;
}

// Only REAL stored evaluations are returned. No run / no metrics => null => the UI says "not evaluated".
export async function getLatestEvaluation(kind: "HAND_RAISE" | "WIFI_CSI_LOCALIZATION" | "WIFI_CSI_PRESENCE"): Promise<Evaluation | null> {
  const s = await createSupabaseServerClient();
  const { data: runs } = await s.from("model_runs").select("id, version, features, training_code_ref, trained_at").eq("model_kind", kind).order("created_at", { ascending: false }).limit(5);
  for (const run of (runs ?? []) as Evaluation["run"][]) {
    const { data: ms } = await s.from("model_metrics").select("metric_name, metric_value, sample_count, held_out_count, confusion_matrix, evaluated_at").eq("model_run_id", run.id);
    const rows = (ms ?? []) as { metric_name: string; metric_value: number; sample_count: number; held_out_count: number; confusion_matrix: { labels: string[]; matrix: number[][] } | null; evaluated_at: string }[];
    const acc = rows.find((r) => r.metric_name === "HELD_OUT_ACCURACY");
    if (!acc || !acc.confusion_matrix) continue;
    return {
      run, accuracy: Number(acc.metric_value), sampleCount: acc.sample_count, heldOutCount: acc.held_out_count,
      labels: acc.confusion_matrix.labels, matrix: acc.confusion_matrix.matrix,
      avgPredictionMs: Number(rows.find((r) => r.metric_name === "AVG_PREDICTION_MS")?.metric_value ?? NaN) || null,
      presenceDelayMs: Number(rows.find((r) => r.metric_name === "PRESENCE_DELAY_MS")?.metric_value ?? NaN) || null,
      evaluatedAt: acc.evaluated_at,
    };
  }
  return null;
}

export async function getHandRaiseDataset() {
  const s = await createSupabaseServerClient();
  const { data } = await s.from("handraise_dataset_versions").select("version, status, raised_count, not_raised_count, held_out_raised, held_out_not_raised, created_at").order("created_at", { ascending: false }).limit(1).maybeSingle();
  return data as { version: string; status: "COLLECTING" | "READY"; raised_count: number; not_raised_count: number; held_out_raised: number; held_out_not_raised: number; created_at: string } | null;
}
