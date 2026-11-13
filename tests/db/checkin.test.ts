import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createHash } from "node:crypto";
import { makeTestDb, UID, ID, type TestDb } from "./harness";

let td: TestDb;
let device: string;
const TOKEN = "checkin-token";
const HASH = createHash("sha256").update(TOKEN).digest("hex");
const q = <T = Record<string, unknown>>(sql: string, p?: unknown[]) => td.db.query<T>(sql, p).then((r) => r.rows);
const J = async (sql: string, p: unknown[]) => (await q<{ r: Record<string, unknown> }>(sql, p))[0].r;

const BASE = "2026-12-20T03:00:00Z"; // class start
const at = (min: number) => new Date(Date.parse(BASE) + min * 60_000).toISOString();
let cls: string;

const checkin = (card: string, tapMin: number, face: string | null) =>
  J("select public.process_card_checkin($1,$2,$3::timestamptz,$4,112,112,null) r", [HASH, card, at(tapMin), face]);

beforeAll(async () => {
  td = await makeTestDb({ seed: true });
  await td.asService();
  device = (await q<{ d: string }>("select public.provision_device($1,'T07-CK','T07',$2,$3,$4) d", [ID.school, ID.room, HASH, UID.admin]))[0].d;
  cls = (await q<{ id: string }>(
    "insert into public.class_sessions (room_id,title,starts_at,ends_at) values ($1,'Math',$2,$3) returning id",
    [ID.room, at(0), at(60)],
  ))[0].id;
  await q("insert into public.class_enrollments (class_session_id, student_id) values ($1,$2)", [cls, ID.studentS1]);
  await q("insert into public.student_cards (student_id, card_uid) values ($1,'AAAA01')", [ID.studentS1]);
  // S2 has a card but is NOT enrolled in this class.
  await q("insert into public.student_cards (student_id, card_uid) values ($1,'BBBB02')", [ID.studentS2]);
});
afterAll(async () => { await td.end(); });

describe("process_card_checkin decisions", () => {
  it("UNKNOWN_CARD for an unregistered card", async () => {
    expect((await checkin("FFFF99", 1, null)).reason).toBe("UNKNOWN_CARD");
  });
  it("NO_CLASS_NOW outside any class", async () => {
    expect((await checkin("AAAA01", 120, null)).reason).toBe("NO_CLASS_NOW");
  });
  it("NOT_IN_THIS_CLASS for an enrolled-elsewhere student", async () => {
    expect((await checkin("BBBB02", 2, null)).reason).toBe("NOT_IN_THIS_CLASS");
  });
  it("NEED_FACE when all non-face gates pass (no grant yet)", async () => {
    const r = await checkin("AAAA01", 3, null);
    expect(r.status).toBe("NEED_FACE");
    expect(r.student_id).toBe(ID.studentS1);
  });
  it("NO_FACE and SPOOF deny; neither records attendance", async () => {
    expect((await checkin("AAAA01", 3, "NO_FACE")).reason).toBe("NO_FACE");
    expect((await checkin("AAAA01", 3, "SPOOF")).reason).toBe("SPOOF");
    const n = await q<{ n: string }>("select count(*)::int n from public.attendance_records where class_session_id=$1", [cls]);
    expect(Number(n[0].n)).toBe(0);
  });
  it("MATCH within 10 min -> GRANTED, PRESENT, door UNLOCKED", async () => {
    const r = await checkin("AAAA01", 5, "MATCH");
    expect(r).toMatchObject({ decision: "GRANTED", reason: "OK", door: "UNLOCKED", attendance_status: "PRESENT" });
  });
  it("repeat check-in opens the door but adds no second record", async () => {
    const r = await checkin("AAAA01", 20, "MATCH"); // would be LATE, but record already exists
    expect(r.decision).toBe("GRANTED");
    expect(r.attendance_status).toBe("PRESENT");
    const n = await q<{ n: string }>("select count(*)::int n from public.attendance_records where class_session_id=$1 and student_id=$2", [cls, ID.studentS1]);
    expect(Number(n[0].n)).toBe(1);
  });
  it("records a check_in row without any face image (only dimensions)", async () => {
    const rows = await q<{ face_crop_w: number }>("select face_crop_w from public.card_checkins where reason='OK' limit 1");
    expect(rows[0].face_crop_w).toBe(112);
  });
  it("denies CAMERA_NOT_AT_DOOR when the selected position is ROOM", async () => {
    await q("insert into public.room_camera_state (room_id, selected_position) values ($1,'ROOM') on conflict (room_id) do update set selected_position='ROOM'", [ID.room]);
    expect((await checkin("AAAA01", 6, "MATCH")).reason).toBe("CAMERA_NOT_AT_DOOR");
    await q("update public.room_camera_state set selected_position='DOOR' where room_id=$1", [ID.room]);
  });
  it("denies CAMERA_FAULT when the latest camera state is COVERED", async () => {
    await q("insert into public.camera_health_events (room_id, state, occurred_at) values ($1,'COVERED',$2)", [ID.room, at(6)]);
    expect((await checkin("AAAA01", 7, "MATCH")).reason).toBe("CAMERA_FAULT");
    await q("insert into public.camera_health_events (room_id, state, occurred_at) values ($1,'OK',$2)", [ID.room, at(8)]);
  });
  it("3 mismatches block the card: next tap is CARD_BLOCKED, then Admin unblock restores", async () => {
    expect((await checkin("AAAA01", 9, "MISMATCH")).reason).toBe("FACE_MISMATCH");
    expect((await checkin("AAAA01", 9.2, "MISMATCH")).reason).toBe("FACE_MISMATCH");
    expect((await checkin("AAAA01", 9.4, "MISMATCH")).reason).toBe("FACE_MISMATCH");
    expect((await checkin("AAAA01", 10, "MATCH")).reason).toBe("CARD_BLOCKED");
    const blk = (await q<{ id: string }>("select id from public.blocked_cards where status='ACTIVE' limit 1"))[0].id;
    await q("select public.unblock_card($1,$2)", [blk, UID.admin]);
    expect((await checkin("AAAA01", 10.5, "MATCH")).decision).toBe("GRANTED");
  });
  it("rejects a bad token", async () => {
    const r = await J("select public.process_card_checkin($1,'AAAA01',$2::timestamptz,null,null,null,null) r",
      [createHash("sha256").update("x").digest("hex"), at(2)]);
    expect(r.status).toBe("unauthorized");
  });
});

describe("Late / Absent + guardian notifications", () => {
  let cls2: string;
  beforeAll(async () => {
    await td.asService();
    cls2 = (await q<{ id: string }>(
      "insert into public.class_sessions (room_id,title,starts_at,ends_at) values ($1,'Sci',$2,$3) returning id",
      [ID.room, at(120), at(180)],
    ))[0].id;
    await q("insert into public.class_enrollments (class_session_id, student_id) values ($1,$2)", [cls2, ID.studentS1]);
  });
  it("tap after 10 min is LATE and notifies the linked guardian once", async () => {
    const r = await checkin("AAAA01", 120 + 15, "MATCH");
    expect(r.attendance_status).toBe("LATE");
    const n = await q<{ n: string }>("select count(*)::int n from public.notifications where kind='GUARDIAN_LATE' and recipient_profile_id=$1", [UID.guardian]);
    expect(Number(n[0].n)).toBe(1);
    await checkin("AAAA01", 120 + 16, "MATCH"); // repeat: no second notification
    const n2 = await q<{ n: string }>("select count(*)::int n from public.notifications where kind='GUARDIAN_LATE' and recipient_profile_id=$1", [UID.guardian]);
    expect(Number(n2[0].n)).toBe(1);
  });
  it("sweep_absent marks no-shows ABSENT after 30 min and notifies once (idempotent)", async () => {
    const cls3 = (await q<{ id: string }>(
      "insert into public.class_sessions (room_id,title,starts_at,ends_at) values ($1,'Art',$2,$3) returning id",
      [ID.room, at(300), at(360)],
    ))[0].id;
    await q("insert into public.class_enrollments (class_session_id, student_id) values ($1,$2)", [cls3, ID.studentS1]);
    expect(Number((await q<{ s: number }>("select public.sweep_absent($1::timestamptz) s", [at(300 + 29)]))[0].s)).toBe(0);
    const marked = Number((await q<{ s: number }>("select public.sweep_absent($1::timestamptz) s", [at(300 + 31)]))[0].s);
    expect(marked).toBeGreaterThanOrEqual(1);
    await q("select public.sweep_absent($1::timestamptz)", [at(300 + 32)]); // idempotent
    const abs = await q<{ n: string }>("select count(*)::int n from public.notifications where kind='GUARDIAN_ABSENT' and recipient_profile_id=$1", [UID.guardian]);
    expect(Number(abs[0].n)).toBe(1);
  });
});

describe("card registration workflow", () => {
  it("links a tapped UID to the student; replaces the old card; rejects a card already in use", async () => {
    await td.asService();
    await q("select public.start_card_registration($1,$2,$3,120)", [ID.studentS2, ID.room, UID.admin]);
    expect((await J("select public.complete_card_registration($1,'cccc03') r", [device])).status).toBe("linked");
    const cards = await q<{ card_uid: string; status: string }>("select card_uid, status from public.student_cards where student_id=$1 order by status", [ID.studentS2]);
    expect(cards.find((c) => c.status === "ACTIVE")?.card_uid).toBe("CCCC03");
    expect(cards.find((c) => c.status === "REMOVED")?.card_uid).toBe("BBBB02");

    await q("select public.start_card_registration($1,$2,$3,120)", [ID.studentS2, ID.room, UID.admin]);
    expect((await J("select public.complete_card_registration($1,'AAAA01') r", [device])).status).toBe("card_in_use");
  });
  it("only an Admin may start a registration", async () => {
    await td.asService();
    await expect(q("select public.start_card_registration($1,$2,$3,120)", [ID.studentS1, ID.room, UID.teacher])).rejects.toThrow(/admin only/);
  });
});

describe("fire reset safety", () => {
  const telem = (seq: number, min: number, flame: boolean) =>
    JSON.stringify({ device_id: "T07-CK", room_id: "ROOM-101", seq, ts: Math.floor(Date.parse(at(min)) / 1000), uptime_s: 1, temp_c: 29, rh: 60, heat_index_c: 31, flame, door: flame ? "UNLOCKED" : "LOCKED", status: flame ? "FIRE" : "SAFE", heat_trend: "STABLE", rssi: -60, heap_kb: 100, chip_temp_c: 40, fw: "1", quality: "good" });
  it("refuses while flame is present; allows Teacher after flame gone; student cannot", async () => {
    await td.asService();
    await q("select public.ingest_telemetry($1,$2::jsonb)", [HASH, telem(900, 400, true)]);
    await q("insert into public.security_incidents (room_id, device_id, incident_type, severity, occurred_at) values ($1,$2,'FIRE','CRITICAL',$3)", [ID.room, device, at(400)]);
    await expect(q("select public.queue_fire_reset($1,$2)", [device, UID.teacher])).rejects.toThrow(/FLAME PRESENT/);
    await q("select public.ingest_telemetry($1,$2::jsonb)", [HASH, telem(901, 401, false)]);
    await expect(q("select public.queue_fire_reset($1,$2)", [device, UID.s1])).rejects.toThrow(/teacher or admin only/);
    const cmd = (await q<{ id: string }>("select public.queue_fire_reset($1,$2) id", [device, UID.teacher]))[0].id;
    const st = await q<{ command_type: string; state: string }>("select command_type, state from public.device_commands where id=$1", [cmd]);
    expect(st[0]).toMatchObject({ command_type: "FIRE_RESET", state: "PENDING" });
  });
});

describe("EXECUTE lockdown", () => {
  it("a signed-in user cannot call privileged functions over RPC", async () => {
    await td.as(UID.admin);
    await expect(q("select public.delete_student($1,$2)", [ID.studentS1, UID.admin])).rejects.toThrow(/permission denied/);
    await expect(q("select public.ack_incident(gen_random_uuid(),$1)", [UID.admin])).rejects.toThrow(/permission denied/);
    await expect(q("select public.provision_device($1,'X','T01',$2,repeat('a',64),$3)", [ID.school, ID.room, UID.admin])).rejects.toThrow(/permission denied/);
  });
  it("read-only RLS helpers still work for signed-in users", async () => {
    await td.as(UID.teacher);
    expect((await q<{ r: boolean }>("select public.can_read_room($1) r", [ID.room]))[0].r).toBe(true);
  });
});
