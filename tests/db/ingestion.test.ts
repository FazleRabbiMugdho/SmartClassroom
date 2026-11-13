import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createHash } from "node:crypto";
import { makeTestDb, UID, ID, type TestDb } from "./harness";

let td: TestDb;
let device: string;
const TOKEN = "ingest-token-1";
const HASH = createHash("sha256").update(TOKEN).digest("hex");
const CODE = "T07-ING";

const q = <T = Record<string, unknown>>(sql: string, p?: unknown[]) =>
  td.db.query<T>(sql, p).then((r) => r.rows);
const callJson = async (fn: string, args: unknown[]) =>
  (await q<{ r: Record<string, unknown> }>(`select public.${fn} as r`, args))[0].r;

function telem(seq: number, ts: number, over: Record<string, unknown> = {}) {
  return JSON.stringify({
    device_id: CODE, room_id: "ROOM-101", seq, ts, uptime_s: 100, temp_c: 29, rh: 60,
    heat_index_c: 31, flame: false, door: "LOCKED", status: "SAFE", heat_trend: "STABLE",
    rssi: -60, heap_kb: 180, chip_temp_c: 41, fw: "1.0.0", quality: "good", ...over,
  });
}
function evt(seq: number, ts: number, type: string, detail: Record<string, unknown> = {}) {
  return JSON.stringify({ device_id: CODE, room_id: "ROOM-101", seq, ts, type, detail });
}

beforeAll(async () => {
  td = await makeTestDb({ seed: true });
  await td.asService();
  device = (
    await q<{ provision_device: string }>(
      "select public.provision_device($1, $2, 'T07', $3, $4, $5) as provision_device",
      [ID.school, CODE, ID.room, HASH, UID.admin],
    )
  )[0].provision_device;
});
afterAll(async () => {
  await td.end();
});

describe("telemetry ingest", () => {
  it("accepts once, rejects the replay as duplicate", async () => {
    expect((await callJson("ingest_telemetry($1, $2::jsonb)", [HASH, telem(100, 1794500000)])).status).toBe("accepted");
    expect((await callJson("ingest_telemetry($1, $2::jsonb)", [HASH, telem(100, 1794500000)])).status).toBe("duplicate");
  });

  it("rejects a bad token as unauthorized", async () => {
    const r = await callJson("ingest_telemetry($1, $2::jsonb)", [createHash("sha256").update("nope").digest("hex"), telem(101, 1794500005)]);
    expect(r.status).toBe("unauthorized");
  });

  it("rejects a payload device_id that is not the token's device", async () => {
    const r = await callJson("ingest_telemetry($1, $2::jsonb)", [HASH, telem(102, 1794500010, { device_id: "SOMEONE-ELSE" })]);
    expect(r.status).toBe("device_mismatch");
  });

  it("preserves the device ts exactly", async () => {
    await callJson("ingest_telemetry($1, $2::jsonb)", [HASH, telem(103, 1794500123)]);
    const rows = await q<{ e: string }>("select extract(epoch from device_ts)::bigint e from public.telemetry_readings where device_id=$1 and seq=103", [device]);
    expect(Number(rows[0].e)).toBe(1794500123);
  });

  it("accepts status FIRE and updates device last_seen (online)", async () => {
    await callJson("ingest_telemetry($1, $2::jsonb)", [HASH, telem(104, 1794500200, { status: "FIRE", flame: true, door: "UNLOCKED" })]);
    const on = await q<{ r: boolean }>("select public.is_device_online($1) r", [device]);
    expect(on[0].r).toBe(true);
  });
});

describe("event ingest", () => {
  it("accepts a device event, rejects a server-only type", async () => {
    expect((await callJson("ingest_event($1, $2::jsonb)", [HASH, evt(200, 1794500300, "CARD_TAP", { uid: "04A1" })])).status).toBe("accepted");
    const bad = await callJson("ingest_event($1, $2::jsonb)", [HASH, evt(201, 1794500305, "FACE_MISMATCH")]);
    expect(bad.status).toBe("rejected");
    expect(bad.reason).toBe("not_a_device_event");
  });

  it("SETTINGS_APPLIED updates applied_revision", async () => {
    const rev = Number(
      (await q<{ apply_threshold_change: string }>("select public.apply_threshold_change($1, 31, 39, $2, 'x') as apply_threshold_change", [device, UID.admin]))[0].apply_threshold_change,
    );
    await callJson("ingest_event($1, $2::jsonb)", [HASH, evt(202, 1794500310, "SETTINGS_APPLIED", { config_revision: rev })]);
    const cfg = await q<{ applied_revision: string }>("select applied_revision from public.device_configurations where device_id=$1", [device]);
    expect(Number(cfg[0].applied_revision)).toBe(rev);
  });
});

describe("offline batch", () => {
  it("processes oldest-first, keeps original ts, dedupes", async () => {
    const records = JSON.stringify([
      { kind: "telemetry", ...JSON.parse(telem(305, 1794501000)) },
      { kind: "event", ...JSON.parse(evt(304, 1794500900, "CARD_TAP", { uid: "0B" })) },
      { kind: "telemetry", ...JSON.parse(telem(305, 1794501000)) }, // duplicate of first
    ]);
    const res = (await q<{ r: { status: string; seq: number }[] }>("select public.ingest_batch($1, $2::jsonb) as r", [HASH, records]))[0].r;
    expect(res.map((x) => x.seq)).toEqual([304, 305, 305]); // sorted oldest-first
    expect(res[0].status).toBe("accepted");
    expect(res[1].status).toBe("accepted");
    expect(res[2].status).toBe("duplicate");
    const ts = await q<{ e: string }>("select extract(epoch from device_ts)::bigint e from public.telemetry_readings where device_id=$1 and seq=305", [device]);
    expect(Number(ts[0].e)).toBe(1794501000);
  });
});

describe("config + command delivery", () => {
  it("returns desired config", async () => {
    const cfg = await callJson("get_device_config($1)", [HASH]);
    expect(cfg).toHaveProperty("config_revision");
    expect(cfg).toHaveProperty("warning_temp_c");
  });

  it("enqueue -> claim (DELIVERED) -> ack (ACKNOWLEDGED), then no more", async () => {
    const cmd = (
      await q<{ enqueue_command: string }>(
        "select public.enqueue_command($1, 'SET_THRESHOLDS', $2::jsonb, $3, 120) as enqueue_command",
        [device, JSON.stringify({ warning_temp_c: 30 }), UID.admin],
      )
    )[0].enqueue_command;

    const claimed = await callJson("claim_next_command($1)", [HASH]);
    expect((claimed.command as { id: string }).id).toBe(cmd);
    const st1 = await q<{ state: string }>("select state from public.device_commands where id=$1", [cmd]);
    expect(st1[0].state).toBe("DELIVERED");

    const ack = await callJson("ack_command($1, $2, 'APPLIED', null, 'done')", [HASH, cmd]);
    expect(ack.status).toBe("ok");
    const st2 = await q<{ state: string }>("select state from public.device_commands where id=$1", [cmd]);
    expect(st2[0].state).toBe("ACKNOWLEDGED");

    const again = await callJson("claim_next_command($1)", [HASH]);
    expect(again.command).toBeNull();
  });

  it("enqueue supersedes a prior in-flight command of the same type", async () => {
    const a = (await q<{ enqueue_command: string }>("select public.enqueue_command($1,'OTA_INSTALL','{}'::jsonb,$2,120) as enqueue_command", [device, UID.admin]))[0].enqueue_command;
    await q("select public.enqueue_command($1,'OTA_INSTALL','{}'::jsonb,$2,120)", [device, UID.admin]);
    const st = await q<{ state: string }>("select state from public.device_commands where id=$1", [a]);
    expect(st[0].state).toBe("SUPERSEDED");
  });
});
