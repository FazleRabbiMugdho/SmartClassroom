import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { makeTestDb, UID, ID, type TestDb } from "./harness";

let td: TestDb;
const q = <T = Record<string, unknown>>(sql: string, p?: unknown[]) =>
  td.db.query<T>(sql, p).then((r) => r.rows);

beforeAll(async () => {
  td = await makeTestDb({ seed: true });
});
afterAll(async () => {
  await td.end();
});

describe("migrations + reference data", () => {
  it("loads 12 levels summing to 500 marks", async () => {
    await td.reset();
    const r = await q<{ n: string; total: string }>(
      "select count(*)::int n, sum(marks)::int total from public.competition_levels",
    );
    expect(Number(r[0].n)).toBe(12);
    expect(Number(r[0].total)).toBe(500);
  });
});

describe("integrity constraints", () => {
  it("rejects a duplicate (device_id, seq) in the inbox", async () => {
    await td.asService();
    const ins = `insert into public.device_message_inbox (device_id, seq, message_kind, device_ts, payload)
                 values ($1, 9001, 'TELEMETRY', now(), '{}'::jsonb)`;
    await td.db.query(ins, [ID.device]);
    await expect(td.db.query(ins, [ID.device])).rejects.toThrow();
  });

  it("enforces warning < danger on device_configurations", async () => {
    await td.asService();
    await expect(
      td.db.query(
        `update public.device_configurations set desired_warning_temp_c = 45 where device_id = $1`,
        [ID.device],
      ),
    ).rejects.toThrow();
  });

  it("rejects a non-monotonic config_revision", async () => {
    await td.asService();
    await expect(
      td.db.query(
        `update public.device_configurations set config_revision = 0 where device_id = $1`,
        [ID.device],
      ),
    ).rejects.toThrow(/must not decrease/);
  });

  it("rejects overlapping class sessions in the same room", async () => {
    await td.asService();
    await td.db.query(
      `insert into public.class_sessions (id, room_id, title, starts_at, ends_at)
       values ('00000000-0000-0000-0000-0000000f0001', $1, 'A', '2026-12-01T03:00:00Z', '2026-12-01T04:00:00Z')`,
      [ID.room],
    );
    await expect(
      td.db.query(
        `insert into public.class_sessions (room_id, title, starts_at, ends_at)
         values ($1, 'B', '2026-12-01T03:30:00Z', '2026-12-01T05:00:00Z')`,
        [ID.room],
      ),
    ).rejects.toThrow(/overlapping/);
  });

  it("rejects an evidence video file with a non-conforming name", async () => {
    await td.asService();
    await expect(
      td.db.query(
        `insert into public.evidence_artifacts (level_no, kind, file_name, object_key)
         values (3, 'VIDEO', 'my_video.mov', 'k/one')`,
      ),
    ).rejects.toThrow();
    await td.db.query(
      `insert into public.evidence_artifacts (level_no, kind, file_name, object_key)
       values (3, 'VIDEO', 'T07_L03_video.mp4', 'k/two')`,
    );
  });
});

describe("transactional functions", () => {
  it("ack_incident is atomic: first true, second false", async () => {
    await td.asService();
    const inc = (
      await q<{ id: string }>(
        `insert into public.security_incidents (room_id, incident_type, severity, occurred_at)
         values ($1, 'FIRE', 'CRITICAL', now()) returning id`,
        [ID.room],
      )
    )[0].id;
    const a = await q<{ ack_incident: boolean }>("select public.ack_incident($1, $2) as ack_incident", [inc, UID.teacher]);
    const b = await q<{ ack_incident: boolean }>("select public.ack_incident($1, $2) as ack_incident", [inc, UID.admin]);
    expect(a[0].ack_incident).toBe(true);
    expect(b[0].ack_incident).toBe(false);
    const st = await q<{ state: string }>("select state from public.security_incidents where id = $1", [inc]);
    expect(st[0].state).toBe("ACKNOWLEDGED");
  });

  it("record_attendance is insert-once per (class, student)", async () => {
    await td.asService();
    const cls = (
      await q<{ id: string }>(
        `insert into public.class_sessions (room_id, title, starts_at, ends_at)
         values ($1, 'Att', '2026-12-02T03:00:00Z', '2026-12-02T04:00:00Z') returning id`,
        [ID.room],
      )
    )[0].id;
    const first = await q<{ record_attendance: string }>(
      "select public.record_attendance($1,$2,$3,'PRESENT', now(), 'CARD_FACE', true) as record_attendance",
      [ID.room, cls, ID.studentS1],
    );
    const second = await q<{ record_attendance: string }>(
      "select public.record_attendance($1,$2,$3,'LATE', now(), 'CARD_FACE', true) as record_attendance",
      [ID.room, cls, ID.studentS1],
    );
    expect(second[0].record_attendance).toBe(first[0].record_attendance);
    const n = await q<{ n: string }>(
      "select count(*)::int n from public.attendance_records where class_session_id = $1 and student_id = $2",
      [cls, ID.studentS1],
    );
    expect(Number(n[0].n)).toBe(1);
  });

  it("apply_threshold_change bumps revision + writes history; rejects warn>=danger", async () => {
    await td.asService();
    const rev0 = Number(
      (await q<{ config_revision: string }>("select config_revision from public.device_configurations where device_id=$1", [ID.device]))[0].config_revision,
    );
    const rev1 = Number(
      (await q<{ apply_threshold_change: string }>("select public.apply_threshold_change($1, 33, 41, $2, 'test') as apply_threshold_change", [ID.device, UID.admin]))[0].apply_threshold_change,
    );
    expect(rev1).toBe(rev0 + 1);
    const hist = await q<{ n: string }>("select count(*)::int n from public.device_config_history where device_id=$1 and config_revision=$2", [ID.device, rev1]);
    expect(Number(hist[0].n)).toBe(1);
    await expect(
      td.db.query("select public.apply_threshold_change($1, 42, 40, $2, 'bad')", [ID.device, UID.admin]),
    ).rejects.toThrow(/warning must be below danger/);
  });

  it("blocks a card after 3 face mismatches within 2 minutes", async () => {
    await td.asService();
    const base = "2026-12-03T03:00:00Z";
    const call = (sec: number) =>
      q<{ register_face_mismatch: boolean }>(
        `select public.register_face_mismatch($1,$2,'DEADBEEF',$3,null, timestamptz '${base}' + ($4 || ' seconds')::interval) as register_face_mismatch`,
        [ID.school, ID.room, ID.device, String(sec)],
      );
    expect((await call(0))[0].register_face_mismatch).toBe(false);
    expect((await call(30))[0].register_face_mismatch).toBe(false);
    expect((await call(60))[0].register_face_mismatch).toBe(true); // 3rd within 2 min
    const blockedNow = await q<{ is_card_blocked: boolean }>(
      `select public.is_card_blocked($1,'DEADBEEF', timestamptz '${base}' + interval '90 seconds') as is_card_blocked`,
      [ID.school],
    );
    expect(blockedNow[0].is_card_blocked).toBe(true);
    const blockedLater = await q<{ is_card_blocked: boolean }>(
      `select public.is_card_blocked($1,'DEADBEEF', timestamptz '${base}' + interval '10 minutes') as is_card_blocked`,
      [ID.school],
    );
    expect(blockedLater[0].is_card_blocked).toBe(false); // 5-min block expired
  });

  it("delete_student removes biometrics, queues storage deletion, keeps audit", async () => {
    await td.asService();
    // S2 gets an embedding, a card and a private snapshot, then is deleted.
    await td.db.query(
      `insert into public.face_embeddings (student_id, model_name, model_version, dimensions, embedding, source_image_count)
       values ($1, 'm', '1', 128, '\\x00'::bytea, 3)`,
      [ID.studentS2],
    );
    await td.db.query(
      `insert into public.student_cards (student_id, card_uid) values ($1, 'CAFE01')`,
      [ID.studentS2],
    );
    await td.db.query(
      `insert into public.private_snapshots (school_id, room_id, kind, object_key, content_type, byte_size, student_id, expires_at)
       values ($1, $2, 'MISMATCH', 'snap/s2.jpg', 'image/jpeg', 100, $3, now() + interval '1 day')`,
      [ID.school, ID.room, ID.studentS2],
    );
    await td.db.query("select public.delete_student($1, $2)", [ID.studentS2, UID.admin]);

    const left = await q<{ n: string }>("select count(*)::int n from public.students where id=$1", [ID.studentS2]);
    const emb = await q<{ n: string }>("select count(*)::int n from public.face_embeddings where student_id=$1", [ID.studentS2]);
    const queued = await q<{ n: string }>("select count(*)::int n from public.storage_deletion_queue where object_key='snap/s2.jpg' and reason='STUDENT_DELETED'");
    const audit = await q<{ n: string }>("select count(*)::int n from public.audit_logs where action='STUDENT_DELETED' and target_id=$1", [ID.studentS2]);
    expect(Number(left[0].n)).toBe(0);
    expect(Number(emb[0].n)).toBe(0);
    expect(Number(queued[0].n)).toBe(1);
    expect(Number(audit[0].n)).toBe(1);
  });
});

describe("RLS isolation", () => {
  // Attendance rows for S1 and S2 in a fresh class, inserted as the server.
  let cls: string;
  beforeAll(async () => {
    await td.asService();
    cls = (
      await q<{ id: string }>(
        `insert into public.class_sessions (room_id, title, starts_at, ends_at)
         values ($1, 'RLS', '2026-12-05T03:00:00Z', '2026-12-05T04:00:00Z') returning id`,
        [ID.room],
      )
    )[0].id;
    await td.db.query("select public.record_attendance($1,$2,$3,'PRESENT', now(), 'CARD_FACE', true)", [ID.room, cls, ID.studentS1]);
    // S2 was deleted above; recreate a second student for isolation checks.
    await td.db.query(
      `insert into public.students (id, school_id, student_code, full_name)
       values ('00000000-0000-0000-0000-0000000000d9', $1, 'S9', 'Student S9')`,
      [ID.school],
    );
    await td.db.query("select public.record_attendance($1,$2,'00000000-0000-0000-0000-0000000000d9','LATE', now(), 'CARD_FACE', true)", [ID.room, cls]);
    await td.db.query(
      `insert into public.private_snapshots (school_id, room_id, kind, object_key, content_type, byte_size, expires_at)
       values ($1, $2, 'INTRUDER', 'snap/intruder.jpg', 'image/jpeg', 100, now() + interval '1 day')`,
      [ID.school, ID.room],
    );
  });

  it("student S1 sees only their own attendance", async () => {
    await td.as(UID.s1);
    const rows = await q<{ student_id: string }>("select student_id from public.attendance_records");
    expect(rows.every((r) => r.student_id === ID.studentS1)).toBe(true);
    expect(rows.length).toBeGreaterThan(0);
  });

  it("guardian sees only the linked child (S1), never S9", async () => {
    await td.as(UID.guardian);
    const rows = await q<{ student_id: string }>("select student_id from public.attendance_records");
    expect(rows.every((r) => r.student_id === ID.studentS1)).toBe(true);
  });

  it("teacher sees room attendance (both students)", async () => {
    await td.as(UID.teacher);
    const n = await q<{ n: string }>("select count(*)::int n from public.attendance_records where class_session_id=$1", [cls]);
    expect(Number(n[0].n)).toBe(2);
  });

  it("student cannot read another student's row", async () => {
    await td.as(UID.s1);
    const n = await q<{ n: string }>("select count(*)::int n from public.students where id=$1", ["00000000-0000-0000-0000-0000000000d9"]);
    expect(Number(n[0].n)).toBe(0);
  });

  it("teacher cannot read OTA releases; admin can", async () => {
    await td.asService();
    await td.db.query(
      `insert into public.ota_releases (version, file_size_bytes, sha256, storage_object_key)
       values ('2.0.0', 1024, repeat('a',64), 'fw/2.0.0.bin')`,
    );
    await td.as(UID.teacher);
    expect(Number((await q<{ n: string }>("select count(*)::int n from public.ota_releases"))[0].n)).toBe(0);
    await td.as(UID.admin);
    expect(Number((await q<{ n: string }>("select count(*)::int n from public.ota_releases"))[0].n)).toBeGreaterThan(0);
  });

  it("student cannot read private snapshots; teacher can", async () => {
    await td.as(UID.s1);
    expect(Number((await q<{ n: string }>("select count(*)::int n from public.private_snapshots"))[0].n)).toBe(0);
    await td.as(UID.teacher);
    expect(Number((await q<{ n: string }>("select count(*)::int n from public.private_snapshots"))[0].n)).toBeGreaterThan(0);
  });

  it("guardian cannot read room telemetry", async () => {
    await td.asService();
    await td.db.query(
      `insert into public.device_message_inbox (id, device_id, seq, message_kind, device_ts, payload)
       values ('00000000-0000-0000-0000-00000000f101', $1, 7001, 'TELEMETRY', now(), '{}'::jsonb)`,
      [ID.device],
    );
    await td.db.query(
      `insert into public.telemetry_readings (inbox_id, device_id, room_id, seq, device_ts, uptime_s, temp_c, rh, heat_index_c, flame, door, status, heat_trend, rssi, heap_kb, chip_temp_c, fw, quality)
       values ('00000000-0000-0000-0000-00000000f101', $1, $2, 7001, now(), 10, 29, 60, 31, false, 'LOCKED', 'SAFE', 'STABLE', -60, 180, 41, '1.0.0', 'good')`,
      [ID.device, ID.room],
    );
    await td.as(UID.guardian);
    expect(Number((await q<{ n: string }>("select count(*)::int n from public.telemetry_readings"))[0].n)).toBe(0);
    await td.as(UID.teacher);
    expect(Number((await q<{ n: string }>("select count(*)::int n from public.telemetry_readings"))[0].n)).toBeGreaterThan(0);
  });
});
