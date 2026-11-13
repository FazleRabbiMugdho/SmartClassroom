import type { SupabaseClient } from "@supabase/supabase-js";

export interface LevelStatus {
  level_no: number; attempts: number; passed: boolean; award_pct: number; closed: boolean; previous_passed: boolean; can_attempt: boolean; complete: boolean;
  evidence: { video: boolean; writeup: boolean; code: boolean };
}
export interface ResultRow {
  id: string; test_run_id: string; requirement_code: string; description: string; hardware_required: boolean;
  measured_value: number | null; unit: string | null; limit_value: number | null; outcome: "PENDING" | "PASS" | "FAIL" | "NOT_APPLICABLE";
  evidence_source: "SOFTWARE_TEST" | "MOCK_DEVICE" | "REAL_DEVICE_JUDGE_OBSERVED" | "REAL_DEVICE_SELF_TEST"; measured_at: string | null; notes: string | null;
}
export interface RunRow { id: string; level_no: number; attempt_no: number; call_no: number | null; outcome: "PENDING" | "PASS" | "FAIL"; award_pct: number; judge_name: string | null; judged_at: string | null }

export const isRealEvidence = (s: ResultRow["evidence_source"]) => s === "REAL_DEVICE_JUDGE_OBSERVED" || s === "REAL_DEVICE_SELF_TEST";

/** What is actually proven vs merely simulated, for the readiness view. */
export function summarize(results: ResultRow[]) {
  const hardware = results.filter((r) => r.hardware_required);
  return {
    total: results.length,
    hardwareTotal: hardware.length,
    hardwareProvenReal: hardware.filter((r) => r.outcome === "PASS" && isRealEvidence(r.evidence_source)).length,
    hardwareUnproven: hardware.filter((r) => r.outcome !== "PASS" && r.outcome !== "NOT_APPLICABLE").length,
    softwarePassed: results.filter((r) => !r.hardware_required && r.outcome === "PASS").length,
    pending: results.filter((r) => r.outcome === "PENDING").length,
    failed: results.filter((r) => r.outcome === "FAIL").length,
  };
}

export async function getLevelStatus(s: SupabaseClient, level: number): Promise<LevelStatus> {
  const { data } = await s.rpc("level_status", { p_level: level });
  return data as LevelStatus;
}

export async function getRuns(s: SupabaseClient, level: number): Promise<RunRow[]> {
  const { data } = await s.from("level_test_runs").select("id, level_no, attempt_no, call_no, outcome, award_pct, judge_name, judged_at").eq("level_no", level).order("attempt_no");
  return (data ?? []) as RunRow[];
}

export async function getResults(s: SupabaseClient, runIds: string[]): Promise<ResultRow[]> {
  if (runIds.length === 0) return [];
  const { data } = await s.from("level_test_results").select("id, test_run_id, requirement_code, description, hardware_required, measured_value, unit, limit_value, outcome, evidence_source, measured_at, notes").in("test_run_id", runIds).order("requirement_code");
  return (data ?? []) as ResultRow[];
}
