import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createHash } from "node:crypto";
import { makeTestDb, UID, ID, type TestDb } from "./harness";

let td: TestDb;
const q = <T = Record<string, unknown>>(sql: string, p?: unknown[]) =>
  td.db.query<T>(sql, p).then((r) => r.rows);
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const bool = (rows: { r: boolean }[]) => rows[0].r;

beforeAll(async () => {
  td = await makeTestDb({ seed: true });
});
afterAll(async () => {
  await td.end();
});

describe("login lockout (Level 4: 5 wrong -> 30s)", () => {
  beforeEach(async () => {
    await td.asService();
    await td.db.query("delete from public.login_attempts where identifier = 'lock@test'");
  });

  const fail = (atSec: number) =>
    td.db.query(
      `insert into public.login_attempts (identifier, success, failure_reason, occurred_at)
       values ('lock@test', false, 'bad_password', timestamptz '2026-12-10T03:00:00Z' + ($1||' seconds')::interval)`,
      [String(atSec)],
    );
  const locked = (atSec: number) =>
    q<{ r: boolean }>(
      `select public.is_locked_out('lock@test', timestamptz '2026-12-10T03:00:00Z' + ($1||' seconds')::interval) r`,
      [String(atSec)],
    );

  it("not locked after 4 failures", async () => {
    await td.asService();
    for (let i = 0; i < 4; i++) await fail(i);
    expect(bool(await locked(5))).toBe(false);
  });

  it("locked for 30s after the 5th failure, then clears", async () => {
    await td.asService();
    for (let i = 0; i < 5; i++) await fail(i * 2); // newest failure at t=8s
    expect(bool(await locked(10))).toBe(true);  // within 30s of newest
    expect(bool(await locked(39))).toBe(false); // >30s after newest (8+30=38)
  });

  it("a success resets the consecutive count", async () => {
    await td.asService();
    for (let i = 0; i < 5; i++) await fail(i);
    await td.db.query(
      `insert into public.login_attempts (identifier, success, occurred_at)
       values ('lock@test', true, timestamptz '2026-12-10T03:00:10Z')`,
    );
    expect(bool(await locked(11))).toBe(false);
  });
});

describe("device token lifecycle (Part C2)", () => {
  it("provision reveals a device; verify resolves the active hash", async () => {
    await td.asService();
    const raw = "tok-prov-1";
    const dev = (
      await q<{ provision_device: string }>(
        "select public.provision_device($1, 'T07-D2', 'T07', $2, $3, $4) as provision_device",
        [ID.school, ID.room, sha256(raw), UID.admin],
      )
    )[0].provision_device;
    const resolved = await q<{ verify_device_token: string | null }>(
      "select public.verify_device_token($1) as verify_device_token",
      [sha256(raw)],
    );
    expect(resolved[0].verify_device_token).toBe(dev);
    const wrong = await q<{ verify_device_token: string | null }>(
      "select public.verify_device_token($1) as verify_device_token",
      [sha256("nope")],
    );
    expect(wrong[0].verify_device_token).toBeNull();
    const audited = await q<{ n: string }>(
      "select count(*)::int n from public.audit_logs where action='DEVICE_PROVISIONED' and target_id=$1",
      [dev],
    );
    expect(Number(audited[0].n)).toBe(1);
  });

  it("rotate invalidates the old token and accepts the new", async () => {
    await td.asService();
    const dev = (
      await q<{ provision_device: string }>(
        "select public.provision_device($1, 'T07-D3', 'T07', $2, $3, $4) as provision_device",
        [ID.school, ID.room, sha256("old"), UID.admin],
      )
    )[0].provision_device;
    await td.db.query("select public.rotate_device_token($1, $2, $3)", [dev, sha256("new"), UID.admin]);
    expect((await q<{ v: string | null }>("select public.verify_device_token($1) v", [sha256("old")]))[0].v).toBeNull();
    expect((await q<{ v: string | null }>("select public.verify_device_token($1) v", [sha256("new")]))[0].v).toBe(dev);
    // exactly one ACTIVE credential after rotation
    const act = await q<{ n: string }>(
      "select count(*)::int n from public.device_credentials where device_id=$1 and status='ACTIVE'",
      [dev],
    );
    expect(Number(act[0].n)).toBe(1);
  });

  it("revoke disables the token", async () => {
    await td.asService();
    const dev = (
      await q<{ provision_device: string }>(
        "select public.provision_device($1, 'T07-D4', 'T07', $2, $3, $4) as provision_device",
        [ID.school, ID.room, sha256("rev"), UID.admin],
      )
    )[0].provision_device;
    await td.db.query("select public.revoke_device_token($1, $2, 'lost')", [dev, UID.admin]);
    expect((await q<{ v: string | null }>("select public.verify_device_token($1) v", [sha256("rev")]))[0].v).toBeNull();
  });
});

describe("authorization: login history visibility (RLS)", () => {
  beforeAll(async () => {
    await td.asService();
    await td.db.query(
      `insert into public.login_attempts (identifier, success) values ('audit@test', true)`,
    );
  });
  it("admin reads login history; teacher and student cannot", async () => {
    await td.as(UID.admin);
    expect(Number((await q<{ n: string }>("select count(*)::int n from public.login_attempts"))[0].n)).toBeGreaterThan(0);
    await td.as(UID.teacher);
    expect(Number((await q<{ n: string }>("select count(*)::int n from public.login_attempts"))[0].n)).toBe(0);
    await td.as(UID.s1);
    expect(Number((await q<{ n: string }>("select count(*)::int n from public.login_attempts"))[0].n)).toBe(0);
  });
});
