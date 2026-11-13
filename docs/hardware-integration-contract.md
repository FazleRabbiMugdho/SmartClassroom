# SmartClass — Hardware / Website Integration Contract (Draft v0.1)

**Status:** Draft — shared source of truth between the firmware teammate and the website/backend developer. Not yet approved for integration. Finalized in Prompt 01.
**Date:** 2026-11-13.
**Precedence:** Individual Level 1–12 text (Part B) wins over shared/generalized text.

> This draft adopts the contract defined in Part C of `FastRobox_Website_Backend_Master_Prompts.md`. The web/backend developer owns the HTTP API and publishes schemas; the firmware teammate confirms the device's actual capabilities, paths, timing and field names. **No teammate invents payload fields independently.** Any change = a contract version bump + a sample payload fixture. Approve a version before integrating.

## 1. Versioning & approval

| Field | Value |
|---|---|
| Contract version | `v0.1-draft` (not approved) |
| API base path | `/api/device/v1` |
| Transport | HTTPS with server certificate validation on device (TLS). MQTT-over-TLS only if both teammates re-agree. |
| Team ID / Device ID convention | **OPEN** — see open-questions doc. Paper examples use `T07`, `T07-D1`. |

Approval requires both teammates to sign off here and attach firmware-captured sample payloads.

## 2. Device registration & credentials

- Admin creates a device record, assigns Team ID / device ID and room.
- Backend generates a high-entropy **per-device** token once; stores only a secure hash/verifier; reveals the raw token once during controlled provisioning.
- Device token ≠ Supabase service-role key, ≠ a shared secret. It is revocable and rotatable, with an audit record of who did it.
- Device requests use TLS and authenticate with the per-device credential (header format: **OPEN**, proposed `Authorization: Bearer <device_token>`).
- ESP32 never receives a Supabase service-role key or unrestricted DB access.

## 3. Endpoints (website-owned, proposed)

| Method | Route | Purpose |
|---|---|---|
| POST | `/api/device/v1/telemetry` | One telemetry sample |
| POST | `/api/device/v1/events` | Immediate event (`CARD_TAP`, `FIRE`, `PANIC`, `BOOT`, …) |
| POST | `/api/device/v1/sync` | Batch offline records, oldest-first |
| GET | `/api/device/v1/config` | Latest desired configuration |
| GET | `/api/device/v1/commands/next` | Poll pending commands/settings (if no push channel) |
| POST | `/api/device/v1/commands/{commandId}/ack` | Report command received/applied/failed |
| POST | `/api/device/v1/face/verify` | Cropped face + card UID for owner matching |
| POST | `/api/device/v1/camera/analysis` | Transient frame/analysis metadata (server-side processing) |
| POST | `/api/device/v1/csi/batch` | CSI samples or extracted features |
| POST | `/api/device/v1/health` | Health/task/core status if separate from telemetry |

These are **proposed**, not firmware-confirmed. Confirm before implementation.

## 4. Fixed message contracts (Level 2 fixed-data-format boundary)

Section 6 names are snake_case and must be preserved at the wire boundary. The app normalizes to camelCase internally in **one** adapter; it must not rename or drop fields silently.

### Telemetry
```json
{
  "device_id": "T07-D1", "room_id": "ROOM-101", "seq": 1048, "ts": 1794567890,
  "uptime_s": 742, "temp_c": 29.0, "rh": 64, "heat_index_c": 31.2,
  "flame": false, "door": "LOCKED", "status": "SAFE", "heat_trend": "STABLE",
  "rssi": -61, "heap_kb": 182, "chip_temp_c": 41.5, "fw": "1.0.0", "quality": "good"
}
```

### Event
```json
{
  "device_id": "T07-D1", "room_id": "ROOM-101", "seq": 1049, "ts": 1794567891,
  "type": "CARD_TAP", "detail": { "uid": "04A1B2C3", "source": "RC522" }
}
```

**Event names are exact and case-sensitive:** `BOOT`, `STATUS`, `FIRE`, `FIRE_CLEARED`, `SILENCED`, `PANIC`, `CARD_TAP`, `ENTRY_GRANTED`, `ENTRY_DENIED`, `NO_FACE`, `OFFLINE_ENTRY`, `SENSOR_ERROR`, `SETTINGS_APPLIED`, `OTA_DONE`, `OTA_REJECTED`, `OTA_ROLLBACK`, `UNKNOWN_CARD`, `FACE_MISMATCH`, `SPOOF`, `CARD_BLOCKED`, `STUDENT_DELETED`, `WEATHER_ALERT`, `OCCUPANCY`, `OVER_CAPACITY`, `INTRUDER`, `CAMERA_FAULT`, `CAMERA_OK`, `HAND_RAISED`, `PRESENCE`, `ACK`.

Backend may enrich with server ID, receipt time, actor, room relationship, processing status. It must not rewrite the original `ts` or `seq`.

## 5. Idempotency & sequence

- `(device_id, seq)` uniquely identifies a device message; persistent across restarts; never reused.
- Enforced by a PostgreSQL unique constraint (not only frontend).
- Exact duplicate → explicit already-processed response, no second row.
- Old-but-unseen seq → documented gap/out-of-order policy; do not silently drop a legitimate late offline record.
- Preserve `ts` (device) and `received_at` (server) separately.
- Offline batch: process oldest-first; return per-record `accepted | duplicate | rejected` + reason so the device can advance its queue safely.
- Telemetry/events shared-sequence-namespace: **OPEN** — firmware teammate confirms.

## 6. Config & command state machine

`CREATED → PENDING → DELIVERED → RECEIVED → APPLIED → ACKNOWLEDGED`
Failure paths: `FAILED`, `EXPIRED`, `REJECTED`, `SUPERSEDED`.

Each command stores: ID, device ID, type, payload, actor, created time, expiry, delivery attempts, device ack, result detail, final state. Device config carries a **monotonically increasing config revision**; device reports its applied revision; dashboard distinguishes desired vs applied config. Commands pass a server-side allowlist with role/safety checks before queuing. No unsafe generic commands.

## 7. Face & camera transport

- Face crop submitted transiently for verification; minimum necessary data only; not stored after verification (Level 7).
- Enrollment images create embeddings then are deleted.
- Level 8 mismatch snapshots are private, Teacher/Admin + room-scope only.
- Level 9 live view ≥ 2 FPS via dedicated stream/worker or controlled device stream — never an infinite MJPEG through a short serverless route.
- Counting/live-view frames not stored. Keep only the permitted intruder snapshot + required camera-fault evidence.
- Private media via short-lived signed access or authenticated proxy; never public bucket URLs.

## 8. Handoff checklist (confirm before testing real board)

Device ID/Team ID convention · Room ID source & change rules · base URL + API version · TLS validation on device · auth header/token format · exact telemetry/event field names/types · persistent seq strategy · NTP/timezone treatment · telemetry interval + immediate event send · config poll/command delivery interval · command ack format · offline batch payload + per-record response · face crop format/dimensions/max size/timeout · camera stream/analysis method + frame rate · CSI payload/features + sampling rate · BLE reported name/status · OTA URL/auth/checksum flow · error codes/retry rules · **sample payloads captured from actual firmware**.

All items **OPEN** until the firmware teammate confirms — mirrored in [`hardware-contract-open-questions.md`](./hardware-contract-open-questions.md).
