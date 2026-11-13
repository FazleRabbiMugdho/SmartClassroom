import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createHash } from "node:crypto";
import { makeTestDb, UID, ID, type TestDb } from "./harness";

let td: TestDb;
let device: string;
const HASH = createHash("sha256").update("csi-token").digest("hex");
const q = <T = Record<string, unknown>>(sql: string, p?: unknown[]) => td.db.query<T>(sql, p).then((r) => r.rows);
const n = async (sql: string, p?: unknown[]) => Number((await q<{ n: string }>(sql, p))[0].n);
const T0 = Date.parse("2027-01-10T05:00:00Z");
const at = (s: number) => new Date(T0 + s * 1000).toISOString();
const csi = (payload: Record<string, unknown>, sec = 0) =>
  q<{ r: Record<string, unknown> }>("select public.ingest_csi_batch($1,$2::jsonb,$3::timestamptz) r", [HASH, JSON.stringify({ packets_per_s: 24, subcarriers: 52, wifi_channel: 6, ...payload }), at(sec)]).then((r) => r[0].r);

beforeAll(async () => {
  td = await makeTestDb({ seed: true });
  await td.asService();
  device = (await q<{ d: string }>("select public.provision_device($1,'T07-CS','T07',$2,$3,$4) d", [ID.school, ID.room, HASH, UID.admin]))[0].d;
  await q("insert into public.csi_dataset_versions (version) values ('ds-1')");
});
afterAll(async () => { await td.end(); });

describe("CSI collection", () => {
  const samples = (from: number, to: number, label = "ZONE_1") =>
    Array.from({ length: to - from }, (_, i) => ({ ts: 1800000000 + from + i, seq: from + i, features: [0.1, 0.2], label }));

  it("labelled samples need a COLLECTING dataset and a declared-covered lens", async () => {
    expect(await csi({ dataset_version: "nope", camera_covered: true, samples: samples(0, 2) })).toMatchObject({ status: "rejected", reason: "dataset_not_collecting" });
    expect(await csi({ dataset_version: "ds-1", camera_covered: false, samples: samples(0, 2) })).toMatchObject({ status: "rejected", reason: "camera_must_be_covered" });
    expect(await n("select count(*)::int n from public.csi_labelled_samples")).toBe(0);
  });
  it("splits deterministically: ~25% held out, and a sample never changes side", async () => {
    const r = await csi({ dataset_version: "ds-1", camera_covered: true, samples: samples(0, 200) });
    expect(r.labelled).toBe(200);
    expect(Number(r.held_out)).toBeGreaterThan(30);
    expect(Number(r.held_out)).toBeLessThan(70);
    await csi({ dataset_version: "ds-1", camera_covered: true, samples: samples(0, 200) }); // same seqs again
    const flips = await n("select count(*)::int n from (select dataset_version_id, captured_at, count(distinct split) c from public.csi_labelled_samples group by 1,2 having count(distinct split) > 1) x");
    expect(flips).toBe(0);
  });
  it("stores packet rate/loss/channel for the csi evidence", async () => {
    await csi({ packets_per_s: 31, packets_lost: 2, wifi_channel: 11 });
    const row = await q<{ packets_per_s: string; wifi_channel: number }>("select packets_per_s, wifi_channel from public.csi_packet_stats order by id desc limit 1");
    expect(Number(row[0].packets_per_s)).toBe(31);
    expect(row[0].wifi_channel).toBe(11);
  });
});

describe("CSI presence + zone prediction", () => {
  const pred = (zone: string, model = "m1") => ({ prediction: { zone, confidence: 0.9, model_version: model } });
  it("zone shows at once; presence changes only after 3 s stable and emits one PRESENCE event", async () => {
    await csi(pred("EMPTY"), 0);
    await csi(pred("ZONE_2"), 10);
    expect((await q<{ predicted_zone: string; presence: string }>("select predicted_zone, presence from public.room_csi_live where room_id=$1", [ID.room]))[0])
      .toEqual({ predicted_zone: "ZONE_2", presence: "EMPTY" }); // zone immediate, presence still held
    expect((await csi(pred("ZONE_2"), 12)).emitted).toEqual([]);
    expect((await csi(pred("ZONE_3"), 13)).emitted).toEqual(["PRESENCE"]); // OCCUPIED stable for 3 s (zone changes don't reset presence)
    expect(await n("select count(*)::int n from public.presence_events where state='OCCUPIED'")).toBe(1);
  });
  it("a one-sample EMPTY blip does not flip presence", async () => {
    await csi(pred("EMPTY"), 30); expect((await csi(pred("ZONE_1"), 31)).emitted).toEqual([]);
    expect(await n("select count(*)::int n from public.presence_events where state='EMPTY'")).toBe(0);
  });
  it("rejects any camera-derived input in a CSI prediction", async () => {
    const r = await csi({ prediction: { zone: "ZONE_1", camera: { persons: 2 } } });
    expect(r).toMatchObject({ status: "rejected", reason: "camera_data_not_allowed_in_csi_predictions" });
  });
});

describe("model evaluation integrity", () => {
  const evalBody = (over: Record<string, unknown> = {}, ds: Record<string, unknown> = {}) => JSON.stringify({
    model_kind: "HAND_RAISE", version: "hr-1", features: "pretrained embedding + logistic regression",
    dataset: { version: "hr-ds-1", raised_count: 120, not_raised_count: 130, held_out_raised: 30, held_out_not_raised: 30, ...ds },
    metrics: { held_out_accuracy: 0.9, sample_count: 250, held_out_count: 60, labels: ["RAISED", "NOT_RAISED"], confusion_matrix: [[27, 3], [3, 27]], avg_prediction_ms: 41, ...over },
  });
  it("stores a real evaluation (accuracy, matrix, latency)", async () => {
    await q("select public.record_model_evaluation($1::jsonb)", [evalBody()]);
    const m = await q<{ metric_name: string; metric_value: string }>("select metric_name, metric_value from public.model_metrics order by metric_name");
    expect(m.map((x) => x.metric_name)).toEqual(["AVG_PREDICTION_MS", "HELD_OUT_ACCURACY"]);
  });
  it("refuses a dataset under 100/class or under 20% held out", async () => {
    await expect(q("select public.record_model_evaluation($1::jsonb)", [evalBody({}, { version: "small", raised_count: 50 })])).rejects.toThrow();
    await expect(q("select public.record_model_evaluation($1::jsonb)", [evalBody({}, { version: "leak", held_out_raised: 1, held_out_not_raised: 1 })])).rejects.toThrow();
  });
  it("refuses metrics whose held-out set is under 20% of the evaluated samples", async () => {
    await expect(q("select public.record_model_evaluation($1::jsonb)", [evalBody({ held_out_count: 10 }).replace("hr-1", "hr-2")])).rejects.toThrow();
  });
});

describe("Level 12: link status, sync, offline entries", () => {
  const link = (p: Record<string, unknown>) => q("select public.ingest_link_status($1,$2::jsonb)", [HASH, JSON.stringify(p)]);
  it("records a history row only when state, AP or BLE name changes", async () => {
    await link({ sync_state: "LIVE", ap_active: false, pending_records: 0, ble_name: "SC-T07-LIVE" });
    await link({ sync_state: "LIVE", ap_active: false, pending_records: 0, ble_name: "SC-T07-LIVE" }); // unchanged
    await link({ sync_state: "OFFLINE", ap_active: true, pending_records: 14, oldest_pending_ts: at(-1800), ble_name: "SC-T07-OFFLINE", local_ip: "192.168.4.1" });
    expect(await n("select count(*)::int n from public.device_link_history where device_id=$1", [device])).toBe(2);
    const cur = await q<{ ble_name: string; pending_records: number }>("select ble_name, pending_records from public.device_link_status where device_id=$1", [device]);
    expect(cur[0]).toEqual({ ble_name: "SC-T07-OFFLINE", pending_records: 14 }); // verbatim
  });
  it("counts a sync batch's accepted / duplicate / rejected", async () => {
    await q("select public.record_sync_batch($1,$2::jsonb,$3,$4)", [HASH, JSON.stringify([{ status: "accepted" }, { status: "accepted" }, { status: "duplicate" }, { status: "rejected" }]), at(-1800), at(-10)]);
    const b = await q<{ total: number; accepted: number; duplicates: number; rejected: number }>("select total, accepted, duplicates, rejected from public.sync_batches order by id desc limit 1");
    expect(b[0]).toEqual({ total: 4, accepted: 2, duplicates: 1, rejected: 1 });
  });
  it("OFFLINE_ENTRY becomes attendance at the tap's own time, face NOT verified, once", async () => {
    const cls = (await q<{ id: string }>("insert into public.class_sessions (room_id,title,starts_at,ends_at) values ($1,'Off',$2,$3) returning id", [ID.room, at(-7200), at(7200)]))[0].id;
    await q("insert into public.class_enrollments (class_session_id, student_id) values ($1,$2)", [cls, ID.studentS1]);
    await q("insert into public.student_cards (student_id, card_uid) values ($1,'0FF001') on conflict do nothing", [ID.studentS1]);
    const ev = (seq: number) => JSON.stringify({ device_id: "T07-CS", room_id: "ROOM-101", seq, ts: Math.floor((T0 - 1000 * 1000 + 0) / 1000), type: "OFFLINE_ENTRY", detail: { uid: "0ff001" } });
    await q("select public.ingest_batch($1,$2::jsonb)", [HASH, JSON.stringify([{ kind: "event", ...JSON.parse(ev(70001)) }])]);
    await q("select public.ingest_batch($1,$2::jsonb)", [HASH, JSON.stringify([{ kind: "event", ...JSON.parse(ev(70001)) }])]); // replay
    const a = await q<{ entry_method: string; face_verified: boolean; attendance_status: string; check_in_at: string }>(
      "select entry_method, face_verified, attendance_status, check_in_at from public.attendance_records where class_session_id=$1 and student_id=$2", [cls, ID.studentS1]);
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({ entry_method: "CARD_OFFLINE", face_verified: false, attendance_status: "LATE" });
    expect(await n("select count(*)::int n from public.card_checkins where class_session_id=$1 and is_offline_sync", [cls])).toBe(1);
  });
});
