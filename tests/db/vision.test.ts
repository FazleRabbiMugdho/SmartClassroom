import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createHash } from "node:crypto";
import { makeTestDb, UID, ID, type TestDb } from "./harness";

let td: TestDb;
let device: string;
const HASH = createHash("sha256").update("vision-token").digest("hex");
const q = <T = Record<string, unknown>>(sql: string, p?: unknown[]) => td.db.query<T>(sql, p).then((r) => r.rows);
const n = async (sql: string, p?: unknown[]) => Number((await q<{ n: string }>(sql, p))[0].n);

const T0 = Date.parse("2026-12-30T05:00:00Z");
const at = (sec: number) => new Date(T0 + sec * 1000).toISOString();
let base = 0; // each test uses its own time window so holds never bleed between tests
const vs = (sec: number, p: Record<string, unknown>) =>
  q<{ r: { emitted: string[]; needs_snapshot: { kind: string; incident_id: string } | null } }>(
    "select public.apply_vision_sample($1,$2::jsonb,$3::timestamptz) r", [device, JSON.stringify({ position: "ROOM", person_count: 0, ...p }), at(base + sec)],
  ).then((r) => r[0].r);

beforeAll(async () => {
  td = await makeTestDb({ seed: true });
  await td.asService();
  device = (await q<{ d: string }>("select public.provision_device($1,'T07-VS','T07',$2,$3,$4) d", [ID.school, ID.room, HASH, UID.admin]))[0].d;
  await q("update public.rooms set capacity = 2 where id = $1", [ID.room]);
});
afterAll(async () => { await td.end(); });
beforeEach(async () => {
  await td.asService();
  base += 1000;
  await q("update public.room_vision_live set pending = '{}'::jsonb, stable_count = 0, stable_seats = '{}', over_capacity = false, intruder_active = false, tamper_state = 'OK' where room_id = $1", [ID.room]);
  await q("update public.rooms set night_mode = false where id = $1", [ID.room]);
  await q("update public.security_incidents set state = 'CLOSED' where room_id = $1", [ID.room]);
});

describe("occupancy holds (Level 9)", () => {
  it("a change counts only after 3 s; a flicker never counts", async () => {
    await vs(0, { person_count: 1, occupied_seats: [1] });
    expect((await vs(2.9, { person_count: 1, occupied_seats: [1] })).emitted).not.toContain("OCCUPANCY");
    expect((await vs(3, { person_count: 1, occupied_seats: [1] })).emitted).toContain("OCCUPANCY");
    expect(await n("select count(*)::int n from public.occupancy_events where event_type='COUNT_STABLE' and person_count=1")).toBeGreaterThanOrEqual(1);

    await vs(10, { person_count: 2, occupied_seats: [1, 2] });
    await vs(11, { person_count: 1, occupied_seats: [1] }); // back before 3 s: no change recorded
    expect((await vs(14.5, { person_count: 1, occupied_seats: [1] })).emitted).not.toContain("OCCUPANCY");
  });
  it("occupied seats are part of the state (same count, different seat => a real change)", async () => {
    await vs(0, { person_count: 1, occupied_seats: [1] }); await vs(3, { person_count: 1, occupied_seats: [1] });
    await vs(10, { person_count: 1, occupied_seats: [2] });
    expect((await vs(13, { person_count: 1, occupied_seats: [2] })).emitted).toContain("OCCUPANCY");
  });
});

describe("capacity", () => {
  it("over capacity held 3 s => OVER_CAPACITY event + incident; restored after 3 s under", async () => {
    await vs(0, { person_count: 3 });
    expect((await vs(2, { person_count: 3 })).emitted).not.toContain("OVER_CAPACITY");
    expect((await vs(3, { person_count: 3 })).emitted).toContain("OVER_CAPACITY");
    expect(await n("select count(*)::int n from public.security_incidents where incident_type='OVER_CAPACITY' and state<>'CLOSED'")).toBe(1);
    await vs(10, { person_count: 1 }); await vs(13, { person_count: 1 });
    expect(await n("select count(*)::int n from public.security_incidents where incident_type='OVER_CAPACITY' and state<>'CLOSED'")).toBe(0);
  });
});

describe("night watch", () => {
  it("no INTRUDER while Night mode is off", async () => {
    await vs(0, { person_count: 1 });
    expect((await vs(4, { person_count: 1 })).emitted).not.toContain("INTRUDER");
  });
  it("person for 3 s in Night mode => one INTRUDER + a snapshot request; staying does not repeat", async () => {
    await q("update public.rooms set night_mode = true where id = $1", [ID.room]);
    await vs(0, { person_count: 1 });
    const r = await vs(3, { person_count: 1 });
    expect(r.emitted).toContain("INTRUDER");
    expect(r.needs_snapshot?.kind).toBe("INTRUDER");
    expect((await vs(8, { person_count: 1 })).emitted).not.toContain("INTRUDER");
    // The staff were alerted by the incident trigger.
    expect(await n("select count(*)::int n from public.notifications where kind='INCIDENT_ALERT' and title like 'INTRUDER%'")).toBeGreaterThanOrEqual(1);
  });
});

describe("camera health (COVERED / MOVED)", () => {
  const sc = (cover: number, move: number) => ({ tamper: { cover_score: cover, move_score: move, cover_threshold: 0.8, move_threshold: 0.6 } });
  it("a sustained cover raises a fault with live scores; recovery closes it", async () => {
    await vs(0, sc(0.95, 0));
    expect((await vs(2, sc(0.95, 0))).emitted).not.toContain("CAMERA_FAULT");
    const f = await vs(3, sc(0.95, 0));
    expect(f.emitted).toContain("CAMERA_FAULT");
    expect(f.needs_snapshot?.kind).toBe("CAMERA_FAULT");
    const ev = await q<{ state: string; cover_score: string; cover_threshold: string }>("select state, cover_score, cover_threshold from public.camera_health_events order by id desc limit 1");
    expect(ev[0]).toMatchObject({ state: "COVERED" });
    expect(Number(ev[0].cover_score)).toBe(0.95);
    expect(Number(ev[0].cover_threshold)).toBe(0.8);

    await vs(10, sc(0.1, 0)); const ok = await vs(13, sc(0.1, 0));
    expect(ok.emitted).toContain("CAMERA_OK");
    expect(await n("select count(*)::int n from public.security_incidents where incident_type='CAMERA_FAULT' and state<>'CLOSED'")).toBe(0);
  });
  it("MOVED is detected from the move score", async () => {
    await vs(0, sc(0, 0.9)); expect((await vs(3, sc(0, 0.9))).emitted).toContain("CAMERA_FAULT");
    expect((await q<{ state: string }>("select state from public.camera_health_events order by id desc limit 1"))[0].state).toBe("MOVED");
  });
  it("people walking through (a 2 s spike) never cause a fault", async () => {
    await vs(0, sc(0.1, 0)); await vs(1, sc(0.95, 0)); await vs(2, sc(0.95, 0));
    const r = await vs(3, sc(0.1, 0));
    expect(r.emitted).not.toContain("CAMERA_FAULT");
    expect(await n("select count(*)::int n from public.security_incidents where incident_type='CAMERA_FAULT' and state<>'CLOSED'")).toBe(0);
  });
  it("while a fault is active, card check-in is denied (CAMERA_FAULT)", async () => {
    await vs(0, sc(0.95, 0)); await vs(3, sc(0.95, 0));
    const cls = (await q<{ id: string }>("insert into public.class_sessions (room_id,title,starts_at,ends_at) values ($1,'V',$2,$3) returning id", [ID.room, at(base - 600), at(base + 3600)]))[0].id;
    await q("insert into public.class_enrollments (class_session_id, student_id) values ($1,$2)", [cls, ID.studentS1]);
    await q("insert into public.student_cards (student_id, card_uid) values ($1,'EEEE01') on conflict do nothing", [ID.studentS1]);
    const r = (await q<{ r: { reason: string } }>("select public.process_card_checkin($1,'EEEE01',$2::timestamptz,'MATCH',100,100,null) r", [HASH, at(base + 4)]))[0].r;
    expect(r.reason).toBe("CAMERA_FAULT");
  });
});

describe("hand raise (Level 10)", () => {
  const hand = (raised: boolean) => ({ hands: [{ seat_no: 3, raised, confidence: 0.93 }] });
  it("needs 2 s held; fires once per raise; a new raise fires again", async () => {
    await vs(0, hand(true));
    expect((await vs(1.9, hand(true))).emitted).not.toContain("HAND_RAISED");
    expect((await vs(2, hand(true))).emitted).toContain("HAND_RAISED");
    expect((await vs(5, hand(true))).emitted).not.toContain("HAND_RAISED"); // still the same raise
    await vs(6, hand(false));
    await vs(7, hand(true));
    expect((await vs(9, hand(true))).emitted).toContain("HAND_RAISED");
    expect(await n("select count(*)::int n from public.handraise_events where seat_no=3 and occurred_at >= $1", [at(base)])).toBe(2);
    expect(await n("select count(*)::int n from public.device_events where event_type='HAND_RAISED' and source='SERVER' and detail->>'seat'='3' and received_at >= now() - interval '1 hour'")).toBeGreaterThanOrEqual(2);
  });
  it("is ignored unless the camera is at ROOM", async () => {
    await vs(0, { position: "DOOR", ...hand(true) });
    expect((await vs(3, { position: "DOOR", ...hand(true) })).emitted).not.toContain("HAND_RAISED");
  });
});

describe("camera position selection", () => {
  it("needs a saved reference; teacher can select, student cannot; confirmed comes from the device", async () => {
    await expect(q("select public.select_camera_position($1,'DOOR',$2)", [ID.room, UID.teacher])).rejects.toThrow(/no reference snapshot/);
    await q("insert into public.camera_positions (room_id, position, reference_object_key, reference_width, reference_height) values ($1,'DOOR','ref/door.jpg',640,480)", [ID.room]);
    await q("select public.select_camera_position($1,'DOOR',$2)", [ID.room, UID.teacher]);
    await expect(q("select public.select_camera_position($1,'DOOR',$2)", [ID.room, UID.s1])).rejects.toThrow(/teacher or admin only/);
    await vs(0, {});
    const st = await q<{ selected_position: string; confirmed_position: string }>("select selected_position, confirmed_position from public.room_camera_state where room_id=$1", [ID.room]);
    expect(st[0]).toMatchObject({ selected_position: "DOOR", confirmed_position: "ROOM" });
  });
  it("night mode: teacher/admin only", async () => {
    await q("select public.set_night_mode($1,true,$2)", [ID.room, UID.teacher]);
    expect(await n("select count(*)::int n from public.rooms where id=$1 and night_mode", [ID.room])).toBe(1);
    await expect(q("select public.set_night_mode($1,false,$2)", [ID.room, UID.guardian])).rejects.toThrow(/teacher or admin only/);
  });
});

describe("seat zones (Level 9)", () => {
  const zone = (seat: number, x: number) => ({ seat_no: seat, label: `Seat ${seat}`, polygon: [[x, 0.1], [x + 0.2, 0.1], [x + 0.2, 0.5], [x, 0.5]] });
  const save = (zones: unknown[], actor: string = UID.admin) => q<{ v: number }>("select public.replace_seat_zones($1,$2::jsonb,640,480,$3) v", [ID.room, JSON.stringify(zones), actor]);

  it("Admin saves >=2 zones with normalized coordinates and a version; a Teacher cannot", async () => {
    expect(Number((await save([zone(1, 0.1), zone(2, 0.5)]))[0].v)).toBe(1);
    await expect(save([zone(1, 0.1)], UID.teacher)).rejects.toThrow(/admin only/);
    const rows = await q<{ seat_no: number; version: number; image_width: number }>("select seat_no, version, image_width from public.seat_zones where room_id=$1 order by seat_no", [ID.room]);
    expect(rows.map((r) => r.seat_no)).toEqual([1, 2]);
    expect(rows[0]).toMatchObject({ version: 1, image_width: 640 });
  });
  it("re-saving replaces the set atomically: removed zones disappear, version increments", async () => {
    expect(Number((await save([zone(2, 0.55), zone(3, 0.1)]))[0].v)).toBe(2);
    const rows = await q<{ seat_no: number }>("select seat_no from public.seat_zones where room_id=$1 order by seat_no", [ID.room]);
    expect(rows.map((r) => r.seat_no)).toEqual([2, 3]);
  });
  it("rejects a polygon that is not an array", async () => {
    await expect(save([{ seat_no: 9, polygon: "nope" }])).rejects.toThrow();
  });
});
