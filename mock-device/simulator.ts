/**
 * Dev-only mock ESP32 simulator (Part C8). Drives the dashboard without hardware.
 * Uses test credentials. NOT evidence that the physical board passed a level.
 * Run the app (`npm run dev`), then `npm run mock`.
 *
 * Refuses to run when NODE_ENV=production.
 */
if (process.env.NODE_ENV === "production") {
  console.error("mock simulator is disabled in production");
  process.exit(1);
}

const BASE = process.env.MOCK_BASE_URL ?? "http://localhost:3000";
const DEVICE_ID = process.env.DEV_DEVICE_ID ?? "T07-D1";
const ROOM_ID = process.env.DEV_DEVICE_ROOM ?? "ROOM-101";
const TOKEN = process.env.DEV_DEVICE_TOKEN ?? "dev-device-token-T07-D1";

const headers = {
  "content-type": "application/json",
  authorization: `Bearer ${TOKEN}`,
};

let seq = 1;
const nowTs = () => Math.floor(Date.now() / 1000);

function telemetry(overrides: Record<string, unknown> = {}) {
  return {
    device_id: DEVICE_ID, room_id: ROOM_ID, seq: seq++, ts: nowTs(),
    uptime_s: seq * 5, temp_c: 28 + Math.random() * 6, rh: 60 + Math.random() * 10,
    heat_index_c: 31 + Math.random() * 4, flame: false, door: "LOCKED",
    status: "SAFE", heat_trend: "STABLE", rssi: -55 - Math.floor(Math.random() * 20),
    heap_kb: 180, chip_temp_c: 41 + Math.random() * 3, fw: "1.0.0", quality: "good",
    ...overrides,
  };
}

function evt(type: string, detail: Record<string, unknown> = {}) {
  return { device_id: DEVICE_ID, room_id: ROOM_ID, seq: seq++, ts: nowTs(), type, detail };
}

async function post(path: string, body: unknown) {
  try {
    const res = await fetch(`${BASE}${path}`, { method: "POST", headers, body: JSON.stringify(body) });
    const json = await res.json().catch(() => ({}));
    console.log(`POST ${path} -> ${res.status}`, JSON.stringify(json));
    return json;
  } catch (err) {
    console.error(`POST ${path} failed:`, (err as Error).message);
  }
}

async function demos() {
  // Boot event.
  await post("/api/device/v1/events", evt("BOOT", { reset_reason: "POWER_ON" }));

  // Duplicate-prevention: send a telemetry sample, then replay the SAME (device_id, seq).
  const t = telemetry();
  await post("/api/device/v1/telemetry", t);
  await post("/api/device/v1/telemetry", t); // expect status: "duplicate"

  // Out-of-order offline batch: records must be accepted and keep original ts.
  const older = { kind: "event" as const, ...evt("CARD_TAP", { uid: "04A1B2C3", source: "RC522" }) };
  const newer = { kind: "telemetry" as const, ...telemetry() };
  await post("/api/device/v1/sync", { device_id: DEVICE_ID, records: [newer, older] });
}

// Synthetic vision/CSI/link samples (MOCK_VISION=1). Every payload carries synthetic:true so the
// dashboard labels it; this is NOT evidence that a real camera or CSI pipeline works.
async function syntheticSamples(tick: number) {
  const present = tick % 8 < 4; // someone stands in the room for 4 ticks, then leaves
  await post("/api/device/v1/camera/analysis", {
    device_id: DEVICE_ID, room_id: ROOM_ID, ts: nowTs(), position: "ROOM", synthetic: true, fps: 2, model_version: "mock-det-0",
    persons: present ? [{ x: 0.12, y: 0.3, w: 0.1, h: 0.35, confidence: 0.9 }] : [],
    tamper: { cover_score: 0.05, move_score: 0.05, cover_threshold: 0.8, move_threshold: 0.6 },
    hands: [{ seat_no: 1, raised: tick % 10 < 3 }],
  });
  await post("/api/device/v1/csi/batch", {
    device_id: DEVICE_ID, room_id: ROOM_ID, packets_per_s: 24, subcarriers: 52, wifi_channel: 6, synthetic: true,
    prediction: { zone: present ? "ZONE_2" : "EMPTY", confidence: 0.8, model_version: "mock-csi-0" },
  });
  await post("/api/device/v1/health", {
    device_id: DEVICE_ID, ts: nowTs(), chip_temp_c: 41.5, free_heap_kb: 182, free_psram_kb: 7000, flash_size_kb: 16384, cpu_freq_mhz: 240,
    rssi: -61, uptime_s: tick * 5, reset_reason: "POWER_ON", fw: "1.0.0", tasks: [{ name: "net", core: 0, free_stack: 2048 }],
    sync_state: "LIVE", ap_active: false, pending_records: 0, ble_name: "SC-" + (process.env.DEV_TEAM_ID ?? "T07") + "-LIVE",
  });
}

async function loop() {
  await demos();
  console.log("--- streaming telemetry every ~5s (Ctrl+C to stop) ---");
  let n = 0;
  for (;;) {
    await post("/api/device/v1/telemetry", telemetry());
    if (++n % 6 === 0) await post("/api/device/v1/events", evt("CARD_TAP", { uid: "04A1B2C3", source: "RC522" }));
    const jitter = 5000 + (Math.random() * 2000 - 1000); // 5 ± 1 s
    await new Promise((r) => setTimeout(r, jitter));
  }
}

loop();
