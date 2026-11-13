import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createHash } from "node:crypto";
import { makeTestDb, UID, ID, type TestDb } from "./harness";

let td: TestDb;
let device: string;
const HASH = createHash("sha256").update("safety-token").digest("hex");
const CODE = "T07-SF";
const q = <T = Record<string, unknown>>(sql: string, p?: unknown[]) => td.db.query<T>(sql, p).then((r) => r.rows);
const n = async (sql: string, p?: unknown[]) => Number((await q<{ n: string }>(sql, p))[0].n);

let seq = 5000;
const ts = (min: number) => Math.floor(Date.parse("2026-12-10T05:00:00Z") / 1000) + min * 60;
const evt = (type: string, min: number, detail: Record<string, unknown> = {}) =>
  JSON.stringify({ device_id: CODE, room_id: "ROOM-101", seq: seq++, ts: ts(min), type, detail });
const telem = (min: number, status: string, quality = "good", temp = 29, isoTs?: number) =>
  JSON.stringify({ device_id: CODE, room_id: "ROOM-101", seq: seq++, ts: isoTs ?? ts(min), uptime_s: 1, temp_c: temp, rh: 60, heat_index_c: 31,
    flame: status === "FIRE", door: "LOCKED", status, heat_trend: "STABLE", rssi: -60, heap_kb: 100, chip_temp_c: 40, fw: "1", quality });
const ingestE = (min: number, type: string, d = {}) => q("select public.ingest_event($1,$2::jsonb)", [HASH, evt(type, min, d)]);
const ingestT = (...a: Parameters<typeof telem>) => q("select public.ingest_telemetry($1,$2::jsonb)", [HASH, telem(...a)]);

beforeAll(async () => {
  td = await makeTestDb({ seed: true });
  await td.asService();
  device = (await q<{ d: string }>("select public.provision_device($1,$2,'T07',$3,$4,$5) d", [ID.school, CODE, ID.room, HASH, UID.admin]))[0].d;
});
afterAll(async () => { await td.end(); });

describe("incidents from device events", () => {
  it("FIRE opens one incident (no duplicates); only FIRE_CLEARED closes it", async () => {
    await ingestE(0, "FIRE");
    await ingestE(1, "FIRE");
    expect(await n("select count(*)::int n from public.security_incidents where incident_type='FIRE' and state<>'CLOSED'")).toBe(1);
    await ingestE(5, "FIRE_CLEARED");
    expect(await n("select count(*)::int n from public.security_incidents where incident_type='FIRE' and state<>'CLOSED'")).toBe(0);
  });
  it("PANIC creates an incident per event", async () => {
    await ingestE(10, "PANIC");
    expect(await n("select count(*)::int n from public.security_incidents where incident_type='PANIC'")).toBe(1);
  });
});

describe("notifications fan-out", () => {
  it("teacher and admin are notified, the guardian and students are not; deduped per incident", async () => {
    const rec = await q<{ recipient_profile_id: string }>("select distinct recipient_profile_id from public.notifications where kind='FIRE'");
    const ids = rec.map((r) => r.recipient_profile_id).sort();
    expect(ids).toEqual([UID.admin, UID.teacher].sort());
    expect(await n("select count(*)::int n from public.notifications where kind='FIRE'")).toBe(2);
  });
});

describe("Heat Danger incident", () => {
  it("raised on entering DANGER only (not on every DANGER reading, not for bad quality)", async () => {
    await ingestT(20, "SAFE");
    await ingestT(21, "DANGER", "bad", 99);          // bad quality: ignored
    expect(await n("select count(*)::int n from public.security_incidents where incident_type='HEAT_DANGER'")).toBe(0);
    await ingestT(22, "DANGER", "good", 41);
    await ingestT(23, "DANGER", "good", 42);          // still DANGER: no second incident
    expect(await n("select count(*)::int n from public.security_incidents where incident_type='HEAT_DANGER'")).toBe(1);
  });
});

describe("phone delivery with retry and no duplicates", () => {
  let notif: string;
  beforeAll(async () => {
    await q("insert into public.notification_channels (user_id, channel, address) values ($1,'TELEGRAM','12345')", [UID.teacher]);
    notif = (await q<{ id: string }>("select id from public.notifications where recipient_profile_id=$1 and kind='FIRE'", [UID.teacher]))[0].id;
  });
  it("lists the teacher's pending notification only (admin has no channel configured)", async () => {
    const rows = await q<{ notification_id: string }>("select notification_id from public.pending_deliveries(50)");
    expect(rows.map((r) => r.notification_id)).toContain(notif);
  });
  it("claims once; a concurrent second claim is refused", async () => {
    const d1 = (await q<{ d: string | null }>("select public.begin_delivery($1,'TELEGRAM','telegram') d", [notif]))[0].d;
    expect(d1).not.toBeNull();
    const d2 = (await q<{ d: string | null }>("select public.begin_delivery($1,'TELEGRAM','telegram') d", [notif]))[0].d;
    expect(d2).toBeNull();
    await q("select public.finish_delivery($1,'FAILED',null,'timeout')", [d1]);
  });
  it("retries as attempt 2 after a failure, then stops once SENT", async () => {
    await q("update public.notification_deliveries set attempted_at = now() - interval '2 minutes'"); // let the retry window pass
    const d = (await q<{ d: string }>("select public.begin_delivery($1,'TELEGRAM','telegram') d", [notif]))[0].d;
    const a = await q<{ attempt_no: number }>("select attempt_no from public.notification_deliveries where id=$1", [d]);
    expect(a[0].attempt_no).toBe(2);
    await q("select public.finish_delivery($1,'SENT','tg-1',null)", [d]);
    expect((await q<{ d: string | null }>("select public.begin_delivery($1,'TELEGRAM','telegram') d", [notif]))[0].d).toBeNull();
    const pend = await q<{ notification_id: string }>("select notification_id from public.pending_deliveries(50)");
    expect(pend.map((r) => r.notification_id)).not.toContain(notif);
  });
});

describe("settings: thresholds + command in one transaction", () => {
  it("admin change bumps revision, logs history, queues SET_THRESHOLDS", async () => {
    const rev = Number((await q<{ r: string }>("select public.change_thresholds($1,31,39,$2,'t') r", [device, UID.admin]))[0].r);
    const cmd = await q<{ payload: { config_revision: number; warning_temp_c: number } }>(
      "select payload from public.device_commands where device_id=$1 and command_type='SET_THRESHOLDS' and state='PENDING'", [device]);
    expect(cmd[0].payload).toMatchObject({ config_revision: rev, warning_temp_c: 31 });
    expect(await n("select count(*)::int n from public.device_config_history where device_id=$1 and config_revision=$2", [device, rev])).toBe(1);
  });
  it("a Teacher cannot change thresholds; invalid values are refused", async () => {
    await expect(q("select public.change_thresholds($1,31,39,$2,'x')", [device, UID.teacher])).rejects.toThrow(/admin only/);
    await expect(q("select public.change_thresholds($1,45,40,$2,'x')", [device, UID.admin])).rejects.toThrow(/warning must be below danger/);
    await expect(q("select public.change_thresholds($1,10,60,$2,'x')", [device, UID.admin])).rejects.toThrow(/out of range/);
  });
  it("room_thresholds is readable by the room's teacher, not by a student", async () => {
    await td.as(UID.teacher);
    expect((await q<{ r: { warning_temp_c: number } }>("select public.room_thresholds($1) r", [ID.room]))[0].r.warning_temp_c).toBe(31);
    await td.as(UID.s1);
    expect((await q<{ r: unknown }>("select public.room_thresholds($1) r", [ID.room]))[0].r).toBeNull();
    await td.asService();
  });
});

describe("OTA job tracking", () => {
  let release: string; let job: string;
  beforeAll(async () => {
    await td.asService();
    release = (await q<{ id: string }>(
      "insert into public.ota_releases (version,file_size_bytes,sha256,storage_object_key) values ('2.1.0',1000,repeat('b',64),'fw/2.1.0.bin') returning id")).at(0)!.id;
  });
  it("only an Admin can start; creates job + OTA_INSTALL command; one active job per device", async () => {
    await expect(q("select public.start_ota_job($1,$2,$3)", [release, device, UID.teacher])).rejects.toThrow(/admin only/);
    job = (await q<{ j: string }>("select public.start_ota_job($1,$2,$3) j", [release, device, UID.admin]))[0].j;
    expect(await n("select count(*)::int n from public.device_commands where device_id=$1 and command_type='OTA_INSTALL' and state='PENDING'", [device])).toBe(1);
    await expect(q("select public.start_ota_job($1,$2,$3)", [release, device, UID.admin])).rejects.toThrow();
  });
  it("follows command state, but is only DONE after a device OTA_DONE event", async () => {
    const claimed = await q<{ r: { command: { id: string } } }>("select public.claim_next_command($1) r", [HASH]);
    // The earlier pending SET_THRESHOLDS may be claimed first; drain until OTA_INSTALL is delivered.
    let guard = 0;
    let state = "";
    while (guard++ < 5) {
      state = (await q<{ state: string }>("select state from public.ota_jobs where id=$1", [job]))[0].state;
      if (state === "DELIVERED") break;
      await q("select public.claim_next_command($1)", [HASH]);
    }
    expect(claimed).toBeTruthy();
    expect(state).toBe("DELIVERED");
    await ingestE(30, "OTA_DONE", { version: "2.1.0" });
    expect((await q<{ state: string }>("select state from public.ota_jobs where id=$1", [job]))[0].state).toBe("DONE");
  });
});

describe("weather danger fan-out", () => {
  beforeAll(async () => { await td.asService(); });
  it("a DANGER notice queues a command per device and notifies staff; ADVISORY does not", async () => {
    await q(`insert into public.weather_notices (school_id, category, severity, source_kind, source_name, window_start, window_end, notice_text)
             values ($1,'STORM','ADVISORY','TEST','test', now(), now() + interval '1 hour', 'minor')`, [ID.school]);
    expect(await n("select count(*)::int n from public.device_commands where command_type='WEATHER_NOTICE'")).toBe(0);
    await q(`insert into public.weather_notices (school_id, category, severity, source_kind, source_name, window_start, window_end, notice_text)
             values ($1,'CYCLONE','DANGER','TEST','test', now(), now() + interval '1 hour', 'take shelter')`, [ID.school]);
    expect(await n("select count(*)::int n from public.device_commands where command_type='WEATHER_NOTICE' and state='PENDING'")).toBeGreaterThanOrEqual(1);
    expect(await n("select count(*)::int n from public.notifications where kind='WEATHER_DANGER'")).toBe(2); // admin + teacher
  });
  it("derived notices are unique per school/category/window", async () => {
    const ins = `insert into public.weather_notices (school_id, category, severity, source_kind, source_name, window_start, window_end, notice_text)
                 values ($1,'HEATWAVE','WARNING','FORECAST_DERIVED','derived','2026-12-20T00:00:00Z','2026-12-20T06:00:00Z','hot')`;
    await q(ins, [ID.school]);
    await expect(q(ins, [ID.school])).rejects.toThrow();
  });
});

describe("daily_report (Asia/Dhaka day, RLS-scoped)", () => {
  const DAY = "2026-12-12"; // Dhaka day = 2026-12-11T18:00Z .. 2026-12-12T18:00Z
  beforeAll(async () => {
    await td.asService();
    const at = (iso: string, temp: number) => ingestT(0, "SAFE", "good", temp, Math.floor(Date.parse(iso) / 1000));
    await at("2026-12-11T17:59:59Z", 50); // 23:59:59 on the 11th Dhaka: NOT in the 12th
    await at("2026-12-11T18:00:00Z", 20); // 00:00:00 on the 12th: in
    await at("2026-12-12T10:00:00Z", 30);
    await at("2026-12-12T17:59:59Z", 40); // 23:59:59 on the 12th: in
    await at("2026-12-12T18:00:00Z", 99); // 00:00 on the 13th: out
    await ingestT(0, "SAFE", "bad", 80, Math.floor(Date.parse("2026-12-12T11:00:00Z") / 1000)); // bad quality: excluded
  });
  it("respects the Dhaka day boundary and excludes bad-quality readings", async () => {
    await td.as(UID.teacher);
    const r = (await q<{ r: { readings: number; temp_c: { min: number; max: number; avg: number }; has_data: boolean } }>(
      "select public.daily_report($1,$2::date) r", [ID.room, DAY]))[0].r;
    expect(r.has_data).toBe(true);
    expect(r.readings).toBe(3);
    expect(r.temp_c).toMatchObject({ min: 20, max: 40, avg: 30 });
  });
  it("has_data=false for a day with no readings (never invented)", async () => {
    await td.as(UID.teacher);
    const r = (await q<{ r: { has_data: boolean; temp_c: unknown } }>("select public.daily_report($1,'2026-01-01') r", [ID.room]))[0].r;
    expect(r.has_data).toBe(false);
    expect(r.temp_c).toBeNull();
  });
  it("a teacher cannot read another room's report (RLS): has_data=false", async () => {
    await td.asService();
    const room2 = (await q<{ id: string }>("insert into public.rooms (school_id, room_code, display_name) values ($1,'ROOM-202','Room 202') returning id", [ID.school]))[0].id;
    const dev2 = (await q<{ d: string }>("select public.provision_device($1,'T07-X2','T07',$2,repeat('c',64),$3) d", [ID.school, room2, UID.admin]))[0].d;
    await q(`insert into public.device_message_inbox (id, device_id, seq, message_kind, device_ts, payload) values ('00000000-0000-0000-0000-00000000f777',$1,1,'TELEMETRY','2026-12-12T10:00:00Z','{}')`, [dev2]);
    await q(`insert into public.telemetry_readings (inbox_id, device_id, room_id, seq, device_ts, uptime_s, temp_c, rh, heat_index_c, flame, door, status, heat_trend, rssi, heap_kb, chip_temp_c, fw, quality)
             values ('00000000-0000-0000-0000-00000000f777',$1,$2,1,'2026-12-12T10:00:00Z',1,33,60,34,false,'LOCKED','SAFE','STABLE',-60,100,40,'1','good')`, [dev2, room2]);
    await td.as(UID.teacher); // not a member of room2
    const r = (await q<{ r: { has_data: boolean } }>("select public.daily_report($1,$2::date) r", [room2, DAY]))[0].r;
    expect(r.has_data).toBe(false);
    await td.as(UID.admin);
    expect((await q<{ r: { has_data: boolean } }>("select public.daily_report($1,$2::date) r", [room2, DAY]))[0].r.has_data).toBe(true);
  });
});
