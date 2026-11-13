import { z } from "zod";

/**
 * Level 2 fixed-data-format boundary. Wire names are snake_case and must be
 * preserved exactly (Part C4). `.passthrough()` keeps unknown firmware fields in
 * the parsed object; the full raw payload is also stored for audit. Required-field
 * violations are rejected (422); unknown fields are never silently dropped.
 */

export const DoorState = z.enum(["LOCKED", "UNLOCKED"]);
// Paper §6: status is SAFE, WARNING, DANGER or FIRE.
export const OverallStatus = z.enum(["SAFE", "WARNING", "DANGER", "FIRE"]);
export const HeatTrend = z.enum(["RISING", "FALLING", "STABLE"]);
export const Quality = z.enum(["good", "bad"]);
export const ResetReason = z.enum([
  "POWER_ON",
  "SOFTWARE",
  "WATCHDOG",
  "CRASH",
  "BROWNOUT",
]);

export const telemetryWire = z
  .object({
    device_id: z.string().min(1),
    room_id: z.string().min(1),
    seq: z.number().int().nonnegative(),
    ts: z.number().int().nonnegative(), // unix seconds, device NTP
    uptime_s: z.number().int().nonnegative(),
    temp_c: z.number(),
    rh: z.number(),
    heat_index_c: z.number(),
    flame: z.boolean(),
    door: DoorState,
    status: OverallStatus,
    heat_trend: HeatTrend,
    rssi: z.number().int(),
    heap_kb: z.number().int().nonnegative(),
    chip_temp_c: z.number(),
    fw: z.string().min(1),
    quality: Quality,
  })
  .passthrough();

// Paper §6: device events carry device seq. Server events carry a server ID instead.
export const DEVICE_EVENT_TYPES = [
  "BOOT", "STATUS", "FIRE", "FIRE_CLEARED", "SILENCED", "PANIC", "CARD_TAP",
  "ENTRY_GRANTED", "ENTRY_DENIED", "NO_FACE", "OFFLINE_ENTRY", "SENSOR_ERROR",
  "SETTINGS_APPLIED", "OTA_DONE", "OTA_REJECTED", "OTA_ROLLBACK",
] as const;
export const SERVER_EVENT_TYPES = [
  "UNKNOWN_CARD", "FACE_MISMATCH", "SPOOF", "CARD_BLOCKED", "STUDENT_DELETED",
  "WEATHER_ALERT", "OCCUPANCY", "OVER_CAPACITY", "INTRUDER", "CAMERA_FAULT",
  "CAMERA_OK", "HAND_RAISED", "PRESENCE", "ACK",
] as const;
export const EventType = z.enum(DEVICE_EVENT_TYPES);

export const eventWire = z
  .object({
    device_id: z.string().min(1),
    room_id: z.string().min(1),
    seq: z.number().int().nonnegative(),
    ts: z.number().int().nonnegative(),
    type: EventType,
    detail: z.record(z.unknown()).default({}),
  })
  .passthrough();

// Offline batch (Part C5): mixed telemetry/event records, oldest-first.
export const batchTelemetry = telemetryWire.extend({ kind: z.literal("telemetry") });
export const batchEvent = eventWire.extend({ kind: z.literal("event") });
export const batchRecord = z.union([batchTelemetry, batchEvent]);
export const offlineBatch = z.object({
  device_id: z.string().min(1),
  records: z.array(batchRecord).min(1),
});

// Face verification (Level 7). Crop is transient and never persisted.
export const faceVerifyRequest = z.object({
  device_id: z.string().min(1),
  room_id: z.string().min(1),
  card_uid: z.string().min(1),
  face_crop: z.string().min(1), // base64; not stored after verification
  crop_w: z.number().int().positive(),
  crop_h: z.number().int().positive(),
  ts: z.number().int().nonnegative(),
});
export const faceVerifyResult = z.object({
  decision: z.enum(["GRANTED", "DENIED"]),
  reason: z.enum([
    "OK", "NO_FACE", "FACE_MISMATCH", "NOT_IN_THIS_CLASS", "NO_CLASS_NOW",
    "UNKNOWN_CARD", "CAMERA_NOT_AT_DOOR", "CAMERA_FAULT", "SPOOF",
  ]),
  door: DoorState,
});

// Desired device configuration (Level 5). config_revision is monotonic per device.
export const deviceConfig = z.object({
  config_revision: z.number().int().nonnegative(),
  warning_temp_c: z.number(),
  danger_temp_c: z.number(),
  telemetry_interval_s: z.number().int().positive(),
});

// Command acknowledgement (Part C6).
export const commandAck = z.object({
  device_id: z.string().min(1),
  status: z.enum(["RECEIVED", "APPLIED", "FAILED"]),
  applied_config_revision: z.number().int().nonnegative().optional(),
  detail: z.string().optional(),
});

// CSI batch (Level 11). The camera is covered and excluded: a prediction may carry CSI-derived
// values only (strict: any extra key such as "camera" is a validation error).
const CSI_LABEL = z.enum(["EMPTY", "ZONE_1", "ZONE_2", "ZONE_3", "ZONE_4"]);
export const csiSample = z.object({
  ts: z.number().int().nonnegative(),
  seq: z.number().int().nonnegative(),
  features: z.array(z.number()),
  label: CSI_LABEL.optional(),
});
export const csiPrediction = z
  .object({
    zone: CSI_LABEL,
    confidence: z.number().min(0).max(1).optional(),
    model_version: z.string().min(1).optional(),
  })
  .strict();
export const csiBatch = z.object({
  device_id: z.string().min(1),
  room_id: z.string().min(1),
  packets_per_s: z.number().nonnegative(),
  packets_lost: z.number().int().nonnegative().optional(),
  subcarriers: z.number().int().positive(),
  wifi_channel: z.number().int().min(1).max(165),
  dataset_version: z.string().min(1).optional(), // only while collecting labelled samples
  camera_covered: z.boolean().optional(), // operator-declared test condition
  samples: z.array(csiSample).max(500).default([]),
  prediction: csiPrediction.optional(),
  synthetic: z.boolean().optional(),
});

// Camera analysis (Levels 9/10). Detection runs in the provider; this carries boxes and scores,
// never a frame (except one optional JPEG, used only when it becomes the single permitted
// INTRUDER or camera-fault snapshot). Seat occupancy is computed by the server from the boxes.
export const personBox = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  w: z.number().min(0).max(1),
  h: z.number().min(0).max(1),
  confidence: z.number().min(0).max(1).optional(),
});
export const cameraAnalysis = z.object({
  device_id: z.string().min(1),
  room_id: z.string().min(1),
  ts: z.number().int().nonnegative(),
  position: z.enum(["DOOR", "ROOM"]),
  persons: z.array(personBox).max(100),
  fps: z.number().positive().max(60).optional(),
  model_version: z.string().optional(),
  tamper: z
    .object({
      cover_score: z.number(),
      move_score: z.number(),
      cover_threshold: z.number(),
      move_threshold: z.number(),
    })
    .optional(),
  hands: z
    .array(z.object({ seat_no: z.number().int().positive(), raised: z.boolean(), confidence: z.number().min(0).max(1).optional() }))
    .optional(),
  snapshot_b64: z.string().max(2_000_000).optional(),
  synthetic: z.boolean().optional(),
});

// Health/task/core status (Level 1).
export const taskInfo = z.object({
  name: z.string(),
  core: z.number().int(),
  free_stack: z.number().int().nonnegative(),
});
export const healthReport = z
  .object({
    device_id: z.string().min(1),
    ts: z.number().int().nonnegative(),
    chip_temp_c: z.number(),
    free_heap_kb: z.number().int().nonnegative(),
    free_psram_kb: z.number().int().nonnegative(),
    flash_size_kb: z.number().int().nonnegative(),
    cpu_freq_mhz: z.number().int().positive(),
    rssi: z.number().int(),
    uptime_s: z.number().int().nonnegative(),
    reset_reason: ResetReason,
    fw: z.string().min(1),
    tasks: z.array(taskInfo),
    // Level 12 link status (optional; shown verbatim, never invented)
    sync_state: z.enum(["LIVE", "OFFLINE", "SYNCING"]).optional(),
    ap_active: z.boolean().optional(),
    pending_records: z.number().int().nonnegative().optional(),
    oldest_pending_ts: z.number().int().nonnegative().optional(),
    ble_name: z.string().max(40).optional(),
    local_ip: z.string().max(45).optional(),
    mdns_name: z.string().max(80).optional(),
    last_error: z.string().max(200).optional(),
  })
  .passthrough();

export type TelemetryWire = z.infer<typeof telemetryWire>;
export type EventWire = z.infer<typeof eventWire>;
export type OfflineBatch = z.infer<typeof offlineBatch>;
export type DeviceConfig = z.infer<typeof deviceConfig>;
export type HealthReport = z.infer<typeof healthReport>;
export type CameraAnalysis = z.infer<typeof cameraAnalysis>;
export type CsiBatch = z.infer<typeof csiBatch>;
