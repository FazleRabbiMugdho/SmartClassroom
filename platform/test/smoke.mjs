// Smoke test for the Level 2 platform. Starts the server on a spare port with throwaway test tokens
// and an in-memory database, then checks the Level 2 behaviours from the checklist.
import { spawn } from "node:child_process";
import assert from "node:assert/strict";

const PORT = 18080 + Math.floor(Math.random() * 500);
const DEV = "test-device-token-123";
const ADMIN = "test-admin-token-456";
const base = `http://127.0.0.1:${PORT}`;

const child = spawn(process.execPath, ["--experimental-sqlite", "server.mjs"], {
  env: { ...process.env, PORT: String(PORT), DB_PATH: ":memory:", OFFLINE_AFTER_S: "2",
         DEVICE_TOKENS: `T01-D1:${DEV}`, ADMIN_TOKEN: ADMIN },
  stdio: ["ignore", "pipe", "inherit"],
});
await new Promise((r) => child.stdout.on("data", (d) => String(d).includes("listening") && r()));

const post = (path, body, token = DEV) =>
  fetch(base + path, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
const get = (path) => fetch(base + path, { headers: { Authorization: `Bearer ${ADMIN}` } }).then((r) => r.json());

const tel = (seq) => ({ device_id: "T01-D1", room_id: "R-101", seq, ts: Math.floor(Date.now() / 1000), uptime_s: 10, temp_c: 29.0,
  rh: 64, heat_index_c: null, flame: false, door: "LOCKED", status: "SAFE", heat_trend: "STABLE", rssi: -61, heap_kb: 182,
  chip_temp_c: 41.5, fw: "1.0.0", quality: "good" });
const ev = (seq, type, detail) => ({ device_id: "T01-D1", room_id: "R-101", seq, ts: Math.floor(Date.now() / 1000), type, detail });

try {
  assert.equal((await post("/api/ingest/telemetry", tel(1), "wrong-token")).status, 401, "wrong token is refused");
  assert.equal((await post("/api/ingest/telemetry", tel(1))).status, 201, "first telemetry stored");
  assert.equal((await post("/api/ingest/telemetry", tel(1))).status, 409, "replay of the same seq is rejected");
  assert.equal((await post("/api/ingest/event", ev(2, "BOOT", "reason=POWER_ON"))).status, 201, "BOOT event stored");
  assert.equal((await post("/api/ingest/event", ev(3, "CARD_TAP", "uid=AA:BB:CC:DD"))).status, 201, "CARD_TAP event stored");
  assert.equal((await post("/api/ingest/event", ev(3, "CARD_TAP", "uid=AA:BB:CC:DD"))).status, 409, "replayed event rejected");
  assert.equal((await post("/api/ingest/event", { ...ev(4, "BOOT", ""), device_id: "T99-D1" })).status, 403, "device_id must match the token");
  assert.equal((await post("/api/ingest/telemetry", { ...tel(5), status: "BROKEN" })).status, 400, "invalid status refused");

  const t = await get("/api/telemetry?limit=10");
  assert.equal(t.length, 1, "replay did not add a second record");
  assert.equal(t[0].seq, 1);
  const e = await get("/api/events?limit=10");
  assert.ok(e.some((x) => x.type === "CARD_TAP" && x.detail === "uid=AA:BB:CC:DD"), "CARD_TAP stored with its UID");
  assert.ok(e.some((x) => x.type === "DEVICE_ONLINE" && x.source === "server"), "online recorded");

  let d = await get("/api/devices");
  assert.equal(d[0].online, 1, "device shows online");
  await new Promise((r) => setTimeout(r, 5000));
  d = await get("/api/devices");
  assert.equal(d[0].online, 0, "device marked offline after silence");
  assert.equal((await post("/api/ingest/telemetry", tel(6))).status, 201);
  d = await get("/api/devices");
  assert.equal(d[0].online, 1, "device back online when it returns");
  const noAuth = await fetch(base + "/api/devices");
  assert.equal(noAuth.status, 401, "reading needs the admin token");

  // Level 3: status values, fire events, and the Reset fire command channel.
  assert.equal((await post("/api/ingest/telemetry", { ...tel(7), status: "FIRE", flame: true, door: "UNLOCKED", heat_index_c: 33.4, heat_trend: "RISING" })).status, 201, "FIRE telemetry stored");
  assert.equal((await post("/api/ingest/event", ev(8, "FIRE", "flame held for 2 s"))).status, 201, "FIRE event stored");
  assert.equal((await post("/api/ingest/event", ev(9, "STATUS", "SAFE->WARNING"))).status, 201, "STATUS event stored");
  const adminPost = (path, body) => fetch(base + path, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${ADMIN}` }, body: JSON.stringify(body) });
  assert.equal((await adminPost("/api/admin/commands", { device_id: "T01-D1", type: "DROP_TABLE" })).status, 400, "unknown command refused");
  assert.equal((await post("/api/admin/commands", { device_id: "T01-D1", type: "RESET_FIRE" }, DEV)).status, 401, "a device cannot send commands");
  assert.equal((await adminPost("/api/admin/commands", { device_id: "T01-D1", type: "RESET_FIRE" })).status, 201, "admin sends Reset fire");
  const devGet = () => fetch(base + "/api/device/commands", { headers: { Authorization: `Bearer ${DEV}` } }).then((r) => r.json());
  const c1 = await devGet();
  assert.equal(c1.length, 1);
  assert.equal(c1[0].type, "RESET_FIRE", "device receives Reset fire");
  assert.equal((await devGet()).length, 0, "a command is delivered once");
  const lastTel = (await get("/api/telemetry?limit=1"))[0];
  assert.equal(lastTel.status, "FIRE");
  console.log("PLATFORM SMOKE TEST: ALL PASSED");
} catch (err) {
  console.error("PLATFORM SMOKE TEST FAILED:", err.message);
  process.exitCode = 1;
} finally {
  child.kill();
}
