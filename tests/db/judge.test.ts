import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { makeTestDb, UID, type TestDb } from "./harness";

let td: TestDb;
const q = <T = Record<string, unknown>>(sql: string, p?: unknown[]) => td.db.query<T>(sql, p).then((r) => r.rows);
const status = async (l: number) => (await q<{ r: Record<string, unknown> }>("select public.level_status($1) r", [l]))[0].r;
const start = async (l: number) => (await q<{ id: string }>("select public.start_level_attempt($1,$2) id", [l, UID.admin]))[0].id;
const addReq = (run: string, outcome: string, source: string, hw = true) =>
  q("insert into public.level_test_results (test_run_id, requirement_code, description, hardware_required, outcome, evidence_source) values ($1,'R1','x',$2,$3,$4)", [run, hw, outcome, source]);
const decide = (run: string, o: string) => q("select public.record_attempt_outcome($1,$2,'Judge A',$3)", [run, o, UID.admin]);

beforeAll(async () => { td = await makeTestDb({ seed: true }); await td.asService(); });
afterAll(async () => { await td.end(); });

describe("strict order, attempts and awards (paper 2.1)", () => {
  it("a level cannot be attempted before the previous one is passed", async () => {
    expect(await status(2)).toMatchObject({ can_attempt: false, previous_passed: false });
    await expect(start(2)).rejects.toThrow(/only be attempted after level 1/);
  });
  it("only an Admin starts or decides an attempt", async () => {
    await expect(q("select public.start_level_attempt(1,$1)", [UID.teacher])).rejects.toThrow(/admin only/);
  });
  it("PASS is refused while requirements are pending, or when none were recorded", async () => {
    const run = await start(1);
    await expect(decide(run, "PASS")).rejects.toThrow(/no requirement results/);
    await addReq(run, "PENDING", "REAL_DEVICE_JUDGE_OBSERVED");
    await expect(decide(run, "PASS")).rejects.toThrow(/pending or failed/);
  });
  it("a simulator or mock result can never mark a hardware requirement PASS (DB constraint)", async () => {
    const run = (await q<{ id: string }>("select id from public.level_test_runs where level_no=1"))[0].id;
    await expect(addReq(run, "PASS", "MOCK_DEVICE")).rejects.toThrow();
    await expect(addReq(run, "PASS", "SOFTWARE_TEST")).rejects.toThrow();
    await addReq(run, "PASS", "SOFTWARE_TEST", false); // a pure-software requirement may be proven by a software test
  });
  it("first-attempt pass awards 100% and unlocks the next level", async () => {
    const run = (await q<{ id: string }>("select id from public.level_test_runs where level_no=1"))[0].id;
    await q("update public.level_test_results set outcome='PASS', evidence_source='REAL_DEVICE_JUDGE_OBSERVED' where test_run_id=$1 and outcome='PENDING'", [run]);
    await decide(run, "PASS");
    expect(await status(1)).toMatchObject({ passed: true, award_pct: 100, can_attempt: false });
    expect(await status(2)).toMatchObject({ can_attempt: true });
  });
  it("a second-attempt pass awards 70%", async () => {
    const r1 = await start(2); await addReq(r1, "FAIL", "REAL_DEVICE_JUDGE_OBSERVED"); await decide(r1, "FAIL");
    expect(await status(2)).toMatchObject({ attempts: 1, closed: false, can_attempt: true });
    const r2 = await start(2); await addReq(r2, "PASS", "REAL_DEVICE_JUDGE_OBSERVED"); await decide(r2, "PASS");
    expect(await status(2)).toMatchObject({ passed: true, award_pct: 70 });
  });
  it("two failed attempts close the level (and everything after it stays locked)", async () => {
    const a = await start(3); await addReq(a, "FAIL", "REAL_DEVICE_JUDGE_OBSERVED"); await decide(a, "FAIL");
    const b = await start(3); await addReq(b, "FAIL", "REAL_DEVICE_JUDGE_OBSERVED"); await decide(b, "FAIL");
    expect(await status(3)).toMatchObject({ closed: true, can_attempt: false });
    await expect(start(3)).rejects.toThrow(/closed/);
    expect(await status(4)).toMatchObject({ can_attempt: false });
  });
  it("a decided attempt cannot be re-decided", async () => {
    const run = (await q<{ id: string }>("select id from public.level_test_runs where level_no=1"))[0].id;
    await expect(decide(run, "FAIL")).rejects.toThrow(/already decided/);
  });
});

describe("completion needs pass + video + write-up + code reference", () => {
  it("is false until every piece of evidence exists", async () => {
    expect(await status(1)).toMatchObject({ passed: true, complete: false });
    await q("insert into public.evidence_artifacts (level_no, kind, file_name, object_key) values (1,'VIDEO','T07_L01_video.mp4','e/v')");
    await q("insert into public.evidence_artifacts (level_no, kind, file_name, object_key) values (1,'WRITEUP','T07_L01_writeup.pdf','e/w')");
    expect(await status(1)).toMatchObject({ complete: false });
    await q("insert into public.level_code_references (level_no, git_tag, commit_sha) values (1,'level-01',repeat('a',40)),(1,'L-01',repeat('a',40))");
    expect(await status(1)).toMatchObject({ complete: true, evidence: { video: true, writeup: true, code: true } });
  });
});
