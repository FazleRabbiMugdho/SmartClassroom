# SmartClass — Hardware Contract Open Questions (Draft v0.1)

**Purpose:** unanswered hardware integration decisions the firmware teammate must confirm before the contract (`hardware-integration-contract.md`) can be approved for integration. Each answer, once confirmed, moves into the contract with a version bump + a sample payload fixture.
**Date:** 2026-11-13. Status legend: 🔴 blocking · 🟡 needed before the relevant level · ⚪ nice-to-have.

---

## Identity & addressing
- 🔴 Team ID and Device ID format (paper examples `T07`, `T07-D1`) — authoritative string the device will send.
- 🔴 Room ID source: fixed in NVS at provisioning, or reassignable? When/how does it change?
- 🟡 mDNS/IP reporting: does the device report its current IP + `smartclass-<teamid>.local` to the cloud, and in which message?

## Transport & auth
- 🔴 Confirm HTTPS (not MQTT-over-TLS) as the agreed transport.
- 🔴 Auth header format for the per-device token (proposed `Authorization: Bearer <device_token>`).
- 🔴 Does the device validate the server TLS certificate (pinned or CA)? Required for Level 2.
- 🟡 Error-code + retry convention the device expects from each endpoint.
- 🟡 Max payload sizes and request timeout the device can tolerate (telemetry, event, sync batch, face crop).

## Sequence & time
- 🔴 Is `seq` a **single shared namespace** across telemetry + events, or separate counters? (Drives idempotency key design.)
- 🔴 Persistent seq strategy across restart/power-cut (NVS counter behaviour).
- 🟡 NTP source + behaviour before first sync; how `ts` is produced if NTP unavailable; timezone treatment (UTC assumed).
- 🟡 Out-of-order/gap policy expectations for late offline records.

## Telemetry & events
- 🟡 Confirm telemetry interval 5 ± 1 s and 1 Hz status-sample availability (Level 1).
- 🟡 Exact field names/types match the fixed data format (Section 6) — confirm no device-side renames.
- 🟡 Which events the firmware actually emits vs the full name list; detail-object shape per event type.

## Config & commands
- 🟡 Push vs poll: will the device poll `GET /commands/next`, and at what interval?
- 🟡 Config revision reporting: how the device reports its applied revision.
- 🟡 Command ack payload shape + which commands the device honors (threshold update, fire reset, teacher-tag ops, weather-alert display, OTA request).

## Face & camera (Levels 7–9)
- 🔴 Face crop format, dimensions (px), max size, timeout.
- 🔴 Camera stream/analysis method for live view and the expected frame rate (≥2 FPS) — device stream vs server worker.
- 🟡 Does the device send the spoof-detection result, and in what field? (Level 8 anti-spoof must not be assumed passed.)
- 🟡 Camera tamper scores (COVERED/MOVED) reporting format for live display (Level 9).

## ML / CSI (Levels 10–11)
- 🟡 CSI payload: raw samples vs extracted features, sampling rate (≥20 pkt/s), batch size.
- 🟡 Hand-raise inference: on-device vs server; event latency; seat-zone mapping source.

## Offline / BLE / recovery (Level 12)
- 🔴 BLE device name/status exact format `SC-<TeamID>-<STATE>` and the full state set.
- 🟡 Offline batch payload shape + per-record response the device expects to advance its queue.
- 🟡 Cached-UID admission: how the device reports `OFFLINE_ENTRY` and which cache it used.
- 🟡 Device-AP-after-30 s-down: does the device report AP availability + pending record count to cloud when it reconnects?

## OTA (Level 5)
- 🔴 OTA download URL auth + checksum/hash algorithm the device validates.
- 🟡 Rollback signalling: which events the device emits and the 60-s no-contact rollback trigger confirmation.

## Required before real-board testing
- 🔴 **Sample payloads captured from actual firmware** for every message type (not hand-written) — these become the contract fixtures and the compatibility-test inputs (Prompt 01).
