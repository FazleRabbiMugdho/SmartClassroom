"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertAdmin, AuthzError } from "@/server/auth/session";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { query } from "@/lib/db";
import { LEVEL_REQUIREMENTS } from "./requirements";
import type { ActionState } from "@/components/ui/ActionForm";

const fail = (message: string): ActionState => ({ ok: false, message });
const done = (message: string): ActionState => ({ ok: true, message });
const run = async (fn: () => Promise<ActionState>): Promise<ActionState> => {
  try { return await fn(); }
  catch (e) { return fail(e instanceof AuthzError ? "Only Admins can do this." : e instanceof Error ? e.message : "Something went wrong."); }
};
const level = z.coerce.number().int().min(1).max(12);

// Strict order, 2 attempts and closure are enforced in SQL (start_level_attempt).
export const startAttemptAction = async (_p: ActionState, fd: FormData) => run(async () => {
  const { user } = await assertAdmin();
  const n = level.parse(fd.get("level"));
  const call = fd.get("call") ? z.coerce.number().int().min(1).max(4).parse(fd.get("call")) : null;
  const svc = createSupabaseServiceClient();
  const { data: runId, error } = await svc.rpc("start_level_attempt", { p_level: n, p_actor: user.id, p_call: call });
  if (error) return fail(error.message);
  // Seed the checklist for this attempt. Hardware requirements start PENDING with a non-hardware
  // source, so they cannot be passed until real-device evidence is chosen.
  await svc.from("level_test_results").insert(
    LEVEL_REQUIREMENTS[n].map((r) => ({
      test_run_id: runId as string, requirement_code: r.code, description: r.text, hardware_required: r.hardware,
      limit_value: r.limit ?? null, unit: r.unit ?? null, outcome: "PENDING", evidence_source: "SOFTWARE_TEST",
    })),
  );
  revalidatePath(`/judge/levels/${n}`); revalidatePath("/judge");
  return done("Attempt started.");
});

export const updateRequirementAction = async (_p: ActionState, fd: FormData) => run(async () => {
  const { user } = await assertAdmin();
  const p = z.object({
    id: z.string().uuid(), level, outcome: z.enum(["PENDING", "PASS", "FAIL", "NOT_APPLICABLE"]),
    source: z.enum(["SOFTWARE_TEST", "MOCK_DEVICE", "REAL_DEVICE_JUDGE_OBSERVED", "REAL_DEVICE_SELF_TEST"]),
    measured: z.string().optional(), notes: z.string().max(500).optional(),
  }).safeParse({ id: fd.get("id"), level: fd.get("level"), outcome: fd.get("outcome"), source: fd.get("source"), measured: fd.get("measured") || undefined, notes: fd.get("notes") || undefined });
  if (!p.success) return fail("Check the outcome and evidence source.");
  const measured = p.data.measured === undefined ? null : Number(p.data.measured);
  if (measured !== null && Number.isNaN(measured)) return fail("Measured value must be a number.");

  const { error } = await createSupabaseServiceClient().from("level_test_results").update({
    outcome: p.data.outcome, evidence_source: p.data.source, measured_value: measured, notes: p.data.notes ?? null,
    measured_at: new Date().toISOString(), tester_profile_id: user.id,
  }).eq("id", p.data.id);
  if (error) {
    // The DB refuses a hardware PASS from a simulator/software source; say so plainly.
    return fail(/level_test_results_check|check constraint/.test(error.message) ? "A hardware requirement can only pass with real-device evidence, not a simulator or software test." : error.message);
  }
  revalidatePath(`/judge/levels/${p.data.level}`);
  return done("Saved.");
});

export const decideAttemptAction = async (_p: ActionState, fd: FormData) => run(async () => {
  const { user } = await assertAdmin();
  const p = z.object({ runId: z.string().uuid(), level, outcome: z.enum(["PASS", "FAIL"]), judge: z.string().trim().min(1).max(80) })
    .safeParse({ runId: fd.get("runId"), level: fd.get("level"), outcome: fd.get("outcome"), judge: fd.get("judge") });
  if (!p.success) return fail("Enter the judge's name.");
  const { error } = await createSupabaseServiceClient().rpc("record_attempt_outcome", { p_run: p.data.runId, p_outcome: p.data.outcome, p_judge: p.data.judge, p_actor: user.id });
  if (error) return fail(error.message);
  revalidatePath(`/judge/levels/${p.data.level}`); revalidatePath("/judge");
  return done(p.data.outcome === "PASS" ? "Attempt recorded as passed." : "Attempt recorded as failed.");
});

// The paper shows both L-NN and level-NN; record both so either tag resolves to the tested commit.
export const addCodeRefAction = async (_p: ActionState, fd: FormData) => run(async () => {
  await assertAdmin();
  const p = z.object({ level, sha: z.string().trim().toLowerCase().regex(/^[0-9a-f]{40}$/, "Use the full 40-character commit hash.") })
    .safeParse({ level: fd.get("level"), sha: fd.get("sha") });
  if (!p.success) return fail(p.error.issues[0].message);
  const nn = String(p.data.level).padStart(2, "0");
  const { error } = await createSupabaseServiceClient().from("level_code_references").upsert(
    [{ level_no: p.data.level, git_tag: `level-${nn}`, commit_sha: p.data.sha }, { level_no: p.data.level, git_tag: `L-${nn}`, commit_sha: p.data.sha }],
    { onConflict: "level_no,git_tag" });
  if (error) return fail(error.message);
  revalidatePath(`/judge/levels/${p.data.level}`);
  return done(`Recorded level-${nn} and L-${nn} for this commit.`);
});

async function teamCode(): Promise<string> {
  const r = await query<{ team_code: string }>("select team_code from public.devices order by created_at limit 1").catch(() => []);
  return r[0]?.team_code ?? process.env.TEAM_ID ?? "T00";
}

// Video/write-up files are large: the browser uploads straight to private storage with a signed URL.
// The name is fixed to <TeamID>_L<NN>_video.mp4 / _writeup.pdf (also enforced by a DB CHECK).
export async function prepareEvidenceUploadAction(levelNo: number, kind: "VIDEO" | "WRITEUP" | "SCREENSHOT", screenshotName?: string): Promise<{ ok: true; path: string; token: string; fileName: string } | { ok: false; message: string }> {
  try {
    await assertAdmin();
    const n = level.parse(levelNo);
    const nn = String(n).padStart(2, "0");
    const team = await teamCode();
    const safeShot = (screenshotName ?? "").replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 60);
    const fileName = kind === "VIDEO" ? `${team}_L${nn}_video.mp4` : kind === "WRITEUP" ? `${team}_L${nn}_writeup.pdf` : `${team}_L${nn}_${safeShot || "screenshot.png"}`;
    const path = `L${nn}/${fileName}`;
    const { data, error } = await createSupabaseServiceClient().storage.from("evidence-artifacts").createSignedUploadUrl(path, { upsert: true });
    if (error || !data) return { ok: false, message: error?.message ?? "Could not prepare the upload." };
    return { ok: true, path, token: data.token, fileName };
  } catch (e) {
    return { ok: false, message: e instanceof AuthzError ? "Only Admins can do this." : "Could not prepare the upload." };
  }
}

export async function confirmEvidenceAction(levelNo: number, kind: "VIDEO" | "WRITEUP" | "SCREENSHOT", fileName: string, path: string): Promise<ActionState> {
  return run(async () => {
    const { user } = await assertAdmin();
    const n = level.parse(levelNo);
    const svc = createSupabaseServiceClient();
    const dir = path.split("/").slice(0, -1).join("/");
    const { data: list } = await svc.storage.from("evidence-artifacts").list(dir, { search: fileName });
    const obj = list?.find((o) => o.name === fileName);
    if (!obj) return fail("The file was not found in storage after upload.");
    const { error } = await svc.from("evidence_artifacts").upsert(
      { level_no: n, kind, file_name: fileName, object_key: path, byte_size: (obj.metadata as { size?: number } | null)?.size ?? null, uploaded_by: user.id, uploaded_at: new Date().toISOString() },
      { onConflict: "level_no,kind,file_name" });
    if (error) return fail(error.message);
    revalidatePath(`/judge/levels/${n}`); revalidatePath("/judge");
    return done(`${fileName} recorded.`);
  });
}
