# FASTROBOX 1.0 — Website & Backend Master Prompt Suite

**Purpose:** Build the complete public HTTPS website, backend, database, realtime platform, AI-service integrations, user experiences and competition evidence tools for FastRobox 1.0.

**Project scope:** The website/backend developer owns this document's deliverables. A separate teammate owns ESP32-S3-CAM firmware, electronics, sensors, physical LED/buzzer behaviour, local device web page, and device-side FreeRTOS/AI/CSI/BLE implementation. This prompt suite defines the software contract between those two workstreams. It must not silently take ownership of the hardware teammate's work.

**Competition source:** `FastRobox_1.0_QuestionPaper_FOR_TEAMS.md` and `fastrobox_1_0_grand_finale_master_blueprint_prompt_suite.md` supplied with the project.

**Important requirement precedence:** The user has explicitly instructed that **the individual Level 1–12 text wins whenever it conflicts with a general/shared requirement elsewhere in the question paper**. Therefore, implement the level-specific values and behaviour listed in Section 2 below. Do not replace them with a conflicting global value. Shared requirements that do not conflict remain applicable. If a level's wording refers to a shared fixed data format, preserve that format and document the mapping in the hardware integration contract.

---

# PART A — PROJECT-WIDE INSTRUCTIONS

## A1. Product vision

Build a production-quality platform called **SmartClass** (working product name) for the FastRobox 1.0 “AI-Powered Smart Classroom: Safety, Access and Vision” challenge.

It is not merely a telemetry dashboard. It is a secure classroom operations platform covering:

1. Classroom and device operations.
2. Environmental monitoring and safety incidents.
3. User authentication and role-based access.
4. RFID, face verification and attendance.
5. Camera, occupancy, Night Watch and camera-health information.
6. Team-trained hand-raise and Wi-Fi CSI model evaluation interfaces.
7. Weather notices, history, reports and a grounded AI assistant.
8. Remote device configuration and OTA release management.
9. Offline synchronization visibility and recovery history.
10. Judge mode, level checklists, measurements and evidence exports.

The interface should look and behave like a carefully designed commercial EdTech/IoT operations product. It must remain readable, responsive, accessible, fast and calm under normal operation, while making urgent incidents unmistakable.

## A2. Developer role and boundaries

You are acting as a Staff Full-Stack Engineer, Product Designer and IoT Platform Architect.

**You own:**
- Next.js website and user experience.
- Backend API and business logic.
- Supabase/PostgreSQL schema, migrations, RLS and database functions.
- Authentication and authorization.
- Device API endpoints, device credential verification and command/config delivery.
- Realtime updates and notifications.
- Data storage lifecycle and private file access.
- Integrations with external weather, notification and AI inference services.
- Reports, CSV exports, Judge Mode and evidence-generation tools.
- Tests, deployment configuration and documentation.

**The hardware teammate owns:**
- ESP32-S3-CAM firmware and board-specific code.
- GPIO selection and wiring.
- RC522, DHT11, flame sensor, buzzer, capacitive touch and RGB LED.
- FreeRTOS tasks, both CPU cores, watchdog and hardware health collection.
- Wi-Fi provisioning AP and device-side local status page.
- mDNS, NVS/LittleFS queue, local recovery and power-loss behaviour.
- Camera driver, on-device face detection/cropping, CSI capture and BLE advertising.
- Device-side OTA partition and rollback implementation.
- Serial Monitor output and physical light/buzzer patterns.

Do not generate firmware, assign GPIO pins, or claim that the web app can itself operate a physical light, buzzer, camera or door. The web platform issues authorised commands and displays device-reported acknowledgements/results. The door is simulated in the challenge; do not invent a physical lock actuator.

## A3. Technology baseline

Use this stack unless the existing repository already has a working equivalent:

- **Frontend:** Next.js 15 App Router, TypeScript, React.
- **Styling:** Tailwind CSS, design tokens, shadcn/ui primitives selectively, custom product components.
- **Icons:** Lucide.
- **Charts:** Recharts.
- **Forms:** React Hook Form + Zod.
- **Server state:** TanStack Query where it adds value; do not duplicate the same data in multiple state stores.
- **Backend:** Next.js Route Handlers / server-side services for the BFF and business operations.
- **Database:** Supabase PostgreSQL.
- **Authentication:** Supabase Auth.
- **Authorization:** server-side permission checks on every protected request + PostgreSQL RLS.
- **Realtime:** Supabase Realtime for authorized dashboard updates.
- **Storage:** Supabase Storage private buckets for allowed snapshots and firmware artifacts.
- **Hosting:** Vercel for the public HTTPS application; Supabase for database/auth/realtime/storage.
- **Heavy/long-running processing:** a separate worker or inference service where required. Do not assume a short-lived serverless route can safely host a persistent camera stream or long model job.
- **AI integrations:** well-defined HTTP adapters to team-owned or externally hosted inference services. The website/backend integrates and records metrics; it must not fabricate model outputs or model accuracy.

Use the package versions compatible with the actual repository and lockfile. Do not upgrade major versions without explaining why and checking compatibility.

## A4. Global engineering rules

1. Inspect the existing repository before changing it. Preserve working code and conventions.
2. Work in small, verifiable stages. Do not generate the entire application in one unreviewable dump.
3. Use strict TypeScript. Avoid `any`; validate all external input with Zod or an equivalent schema.
4. Separate UI, domain services, database access, device adapters and external-service adapters.
5. Do not access Supabase tables directly from arbitrary UI components. Use typed services/hooks and enforce RLS.
6. Do not place service-role keys, device secrets, provider tokens or private inference keys in browser code or Git.
7. Never trust a role, room ID, device ID, card UID, attendance status, event timestamp or permission supplied by the browser without server-side validation.
8. Make ingestion idempotent. Handle duplicate requests, retries, device reconnects and out-of-order delivery deliberately.
9. Use UTC timestamps in storage and APIs. Render human-facing local date/time in `Asia/Dhaka` where the level requires local time.
10. Keep the raw device message and the normalized application model traceable. Do not lose the original device sequence, source timestamp or event detail.
11. Do not store every camera frame. Apply the data-retention rules in the level requirements.
12. Never fake success. UI status must distinguish `PENDING`, `SENT`, `RECEIVED`, `APPLIED`, `FAILED`, `STALE`, `OFFLINE` and `UNKNOWN` where relevant.
13. Do not write seed/demo values into production tables by default. Demo data must be isolated and clearly labelled.
14. Add loading, empty, error, permission-denied, stale-data, offline and retry states to every important page.
15. Never promise a latency target without measuring it. Capture server receipt and device timestamps separately and explain clock-skew limitations.
16. Keep accessibility in scope: keyboard use, focus states, contrast, reduced motion, labels and non-colour-only status cues.
17. Add tests for security-critical business rules and event idempotency.
18. Update README, `.env.example`, migrations and API docs whenever the implementation changes.

## A5. Required development workflow

For each prompt:

1. Read this master document and the source question paper.
2. Inspect the repository and report the current structure before making changes.
3. Identify assumptions and missing hardware-contract details. Use explicit TODOs only where the teammate must provide a value.
4. Propose a short implementation plan and list files to create/change.
5. Implement the smallest complete slice.
6. Run type checks, lint and relevant tests.
7. Fix errors introduced by the changes.
8. Summarize files changed, behaviour implemented, commands run and remaining integration blockers.
9. Never claim a feature is hardware-tested unless it was tested against the actual ESP32 device.

Do not skip acceptance criteria. If the repository has no code yet, scaffold it cleanly. If code exists, adapt rather than overwrite.

---

# PART B — INDIVIDUAL LEVEL REQUIREMENTS TO IMPLEMENT

These are the website/backend acceptance requirements. The hardware teammate implements the device-side half; your backend and frontend must support it and display its actual outputs.

## B1. Level 1 — Dual-Core Tasks, Health and Watchdog (35 marks)

The website does not implement FreeRTOS. It must be ready to consume and present device-reported information when available:

- Device health view matching the device's `health` command: chip temperature, free heap, free PSRAM, flash size, CPU frequency, Wi-Fi RSSI, uptime, last reset reason and firmware version.
- Task inspection view matching the `tasks` command: task name, CPU core and free stack.
- Display one status sample per second if sent by device, plus the device's structured status/event logs.
- Show `[CARD]` tap records only once per physical tap.
- Display sensor failures and their recovery events. The hardware teammate must keep unaffected tasks operational.
- Show boot reason values: `POWER_ON`, `SOFTWARE`, `WATCHDOG`, `CRASH`, `BROWNOUT`.
- Show watchdog reset evidence and the measured restart interval. Do not infer a watchdog pass merely from a new heartbeat.
- Provide a task-health view from the device-reported `tasks` output: task name, CPU core and free stack, so both CPU cores can be inspected.
- Show the boot-time flame check result: no flame -> `LOCKED`; flame -> `UNLOCKED`.
- Surface sensor error and recovery: DHT11 disconnection is detected within 12 seconds; RFID reader disconnection within 3 seconds; the other device functions keep running; the error clears when the sensor returns. The paper's video test disconnects the DHT11 data wire and RC522 SDA wire for 15 seconds.
- Support the Level 1 fire-at-startup door state as a device-reported state.

## B2. Level 2 — Wi-Fi Setup and Secure Telemetry (45 marks)

Individual level text to follow:

- Setup AP SSID: `SmartClass-<TeamID>`.
- Setup AP address: `192.168.4.1`.
- AP uses an 8-character password printed by the device to Serial Monitor at startup; the web platform must not invent or expose it unless the hardware teammate explicitly supplies an authorised provisioning workflow.
- After connection, local status page mDNS: `smartclass-<teamid>.local`.
- Device local page uses Asia/Dhaka local time and refreshes itself at least every 2 seconds. Its hardware-owned display includes Room ID, local time, temperature, humidity, status, flame, door, last card UID, Wi-Fi signal, chip temperature, firmware version and connection state. The website should link to it and display the equivalent cloud values; do not pretend the Vercel site is the local page.
- The hardware-owned setup page lists nearby Wi-Fi networks with signal strength and accepts Wi-Fi password, Room ID and device token. The website owns generation/management of the per-device token and the API contract.
- Telemetry send interval: every `5 ± 1 seconds`.
- Device setup stores Wi-Fi details, Room ID and device token in NVS. The web app must support device registration, creation/rotation of a per-device token and secure display/copy of a token at provisioning time.
- Device uses NTP for Unix timestamps.
- Device sequence number is persistent and strictly increases across restart; message replay is rejected by the server.
- Transport is HTTPS or MQTT over TLS with the server certificate checked. The selected contract for this project is HTTPS unless the hardware teammate and developer jointly decide otherwise.
- Platform marks a device offline within 30 seconds of silence and online again when heartbeat returns.
- Device reconnects after Wi-Fi interruption and backend restart without restarting unnecessarily.
- Wrong credentials/unreachable network return the device to setup mode within 15 seconds (device-side responsibility; website shows last reported error if delivered).
- No password, device token or secret in source control.

**Fixed data format:** Level 2 refers to the paper's Section 6 fixed data format. Preserve that specified message shape at the device boundary. The section lists snake_case names: `device_id`, `room_id`, `seq`, `ts`, `uptime_s`, `temp_c`, `rh`, `heat_index_c`, `flame`, `door`, `status`, `heat_trend`, `rssi`, `heap_kb`, `chip_temp_c`, `fw`, `quality`; event records use `device_id`, `room_id`, `seq`, `ts`, `type`, `detail`. The application may normalize to TypeScript camelCase internally, but the HTTP adapter must accept the exact contract agreed with the firmware teammate and must not rename fields silently. Use `(device_id, seq)` as the idempotency key described by the fixed format.

**Website deliverables:** device onboarding/provisioning record, local-page link, current IP/mDNS display when reported, telemetry charts, connection state, heartbeat history, server receipt status, replay rejection logs and last setup/network error.

## B3. Level 3 — Heat, Fire, Panic and Fail-Safe Door (50 marks)

Implement the web/cloud half of:

- One overall `SAFE`, `WARNING` or `DANGER` state and the device's detailed `FIRE` / `PANIC` states.
- Warning entry at temperature `>= 32 °C` OR humidity `>= 85%`.
- Danger entry at temperature `>= 40 °C`.
- Leave each state 2 °C below its entry limit: Danger at `38 °C`; Warning at `30 °C` and humidity `<= 80%`.
- A new general status must hold for 3 seconds before it becomes a status change/event.
- Store and display heat index, formula/version used, and heat trend from the last 10 temperature readings. Trend must never operate the door, light or buzzer.
- Invalid/impossible readings (temperature outside 0–50 °C or humidity outside 20–90%) have `quality=bad`, keep the last accepted status and are not treated as genuine readings.
- Flame continuously present for 2 seconds triggers `FIRE`; cloud receives `FIRE` within 3 seconds.
- Fire state is latched and remains `UNLOCKED` through power loss. Cloud cannot clear an active flame. Only Teacher/Admin `Reset fire` after flame is gone may clear it.
- A Teacher tag is registered/managed in device flash by hardware; show tag-management status if the device reports it. Student card cannot silence fire.
- Touch panic: ignore touches shorter than 1 second; a 2-second touch raises `PANIC`; cloud event within 3 seconds.
- Teacher/Admin fire/panic banners appear on every logged-in dashboard within 3 seconds.
- Show the door as simulated `LOCKED` / `UNLOCKED`; clearly label it simulated.

Backend must preserve event timestamps, actor, state transition, door state and device acknowledgement. UI controls must not bypass device safety rules.

## B4. Level 4 — Secure Platform, Roles and Alerts (40 marks)

Implement four server-enforced roles:

- **Admin:** all school/platform management, rooms, devices, users, cards, tags, schedules, settings and firmware operations.
- **Teacher:** assigned classes/rooms and associated classroom operations, alerts and permitted reports.
- **Student:** own attendance only and explicitly permitted personal features.
- **Guardian:** linked children only; arrival time, attendance history and Late/Absent notices.

Requirements:

- Public HTTPS login.
- Passwords hashed via Supabase Auth's supported secure flow or bcrypt/Argon2 where custom password handling is genuinely required. Do not store plaintext passwords.
- Authorization checked on every protected server request; RLS policies protect direct data access.
- Live room dashboard updates within 3 seconds of new data.
- Show status, temperature, humidity, heat index, trend, fire, door, recent card taps and online/offline.
- `Reset fire` visible only to Teachers/Admins and still subject to device/fire safety checks.
- Device health panel: last seen, uptime, RSSI, free heap, chip temperature, firmware version and last reset reason.
- Phone message to Teacher for `FIRE`, `PANIC` and Heat Danger within 10 seconds. Support one real delivery channel available to the team (email, Telegram or push); record provider result and time.
- Every dashboard page supports English/Bangla. All relevant menus and labels on at least two pages must switch correctly.
- Login lockout: after 5 wrong passwords in a row, reject even a correct password for 30 seconds; Admin can inspect login attempt history with time, user and success/failure.
- Pre-create judge test accounts: Admin, Teacher, Student S1, Student S2 and Guardian linked to S1. Provide a safe setup/seed workflow, never hardcode real credentials in public source code.

## B5. Level 5 — Remote Settings, OTA and Rollback (30 marks)

- Admin-only settings page controls Warning temperature (default `32 °C`) and Danger temperature (default `40 °C`).
- Validate temperature range 0–50 °C and require Warning threshold lower than Danger threshold.
- Apply each saved change to the device within 10 seconds; persist across restart and show `SETTINGS_APPLIED` event.
- Leaving a state follows 2 °C hysteresis below the applicable threshold, as described in Level 3.
- Every change logs who changed what, old/new values and timestamp.
- Teacher cannot access settings.
- Admin can upload a firmware binary. Use private storage and a signed/authorised download URL or equivalent controlled download mechanism.
- OTA page shows release version, file size, checksum/hash, upload date, uploader, device target, job state, progress and result.
- Backend delivers update instruction and URL to device; device performs HTTPS download, validation, alternate OTA partition installation and restart.
- Store `OTA_DONE`, `OTA_REJECTED` and `OTA_ROLLBACK` events.
- Damaged/incomplete image is rejected without replacing the current firmware.
- Faulty image that installs but cannot reach server within 60 seconds rolls back automatically to previous version. The hardware does rollback; platform tracks the status and events.
- Show current firmware on device health, local-page metadata if sent, and dashboard.

## B6. Level 6 — Weather, History and AI Assistant (40 marks)

Follow Level 6's individual weather schedule: server fetches weather every **15 minutes** (not the conflicting shared interval).

- Weather panel on dashboard: current weather and next 24-hour forecast for school location.
- Notice board for storm, cyclone, heavy rain/flood and heatwave. Severity `Advisory`, `Warning`, `Danger`, source and time window.
- Prefer official alerts where available. Forecast-derived warnings must be visibly labelled as derived, not official.
- Admin can add/remove a TEST notice.
- Danger notice: red banner on each logged-in dashboard within 10 seconds; device alert command/notice must reach device within same 10 seconds; show `WEATHER ALERT` on local page (device-side page), purple LED and three beeps are hardware responsibilities.
- Weather failure: retain last known data with its age and `Data stale`; never show blank/error as if it were current data.
- Stored telemetry chart for a selected period up to the last 24 hours: temperature, humidity and heat index.
- Event history filter by event type and time range.
- Daily report for chosen date: min/max/average temperature and humidity; alarm counts by type; attendance totals Present/Late/Absent (zero until attendance feature is implemented).
- CSV export for filtered events, period readings and daily report.
- Teacher-only AI assistant in English and Bangla. It may answer questions only from stored classroom data and must match the daily report calculations. For missing data it returns exactly a clear “no data” answer, without guessing or filling gaps.
- Students and Guardians cannot access history, report or assistant pages. Teachers see only their own rooms.
- Keep weather API service key server-side only. Store weather cache with fetched timestamp and source metadata.

## B7. Level 7 — Card and Face Check-In (50 marks)

- Admin enrols a student only after consent notice/record.
- Enrollment accepts at least 3 face images per student, creates face embeddings, then deletes original enrollment photographs. Do not retain enrollment images in permanent storage.
- Admin registers an RFID card by a `Register card` workflow: await a device `CARD_TAP` event and link that UID to a student. Admin can change/remove mapping.
- On a card tap the ESP32 performs on-device face detection and sends only the cropped face, along with card UID, to backend for matching. If no face is found within 3 seconds, device denies locally as `NO FACE` without backend dependency.
- Backend compares face against the owner of the tapped card and verifies the student belongs to the currently running class in this room.
- Successful verification commands/acknowledges simulated door unlock for 5 seconds; card tap to unlock must be under 5 seconds.
- One attendance record per student per class. Repeat check-in may open door but must not create a second record.
- Attendance windows from Level 7: Present within first 10 minutes; Late after that; Absent for enrolled students who have not checked in after 30 minutes.
- Denial reasons: `NO FACE`, `NOT IN THIS CLASS`, `NO CLASS NOW`, `UNKNOWN CARD`.
- Linked Guardian receives platform notification within 60 seconds of Late/Absent mark.
- Teacher/Admin see enrollment, card registration, class schedules and attendance.
- Teacher/Admin may see a processing log with incoming face crop dimensions (pixels), but the images used for matching must not be retained after processing. Database stores embeddings, card links, attendance and events; not original face photographs.
- Show last check-in result, reason and time on device integration status if device provides it.

## B8. Level 8 — Spoofing, Lockout and Data Deletion (30 marks)

- If the face does not match the tapped card's owner: deny as `FACE MISMATCH`; never fall back to card-only admission while online.
- Save a private mismatch snapshot. Only Teacher/Admin with correct room access may view it. Alert Teacher within 10 seconds.
- Phone-screen photo of enrolled student with that student's own card must not unlock door. Integrate with the teammate/model's spoof-detection result; do not mark anti-spoof as passed unless evidence exists.
- Three `FACE MISMATCH` results for the same card within 2 minutes block that card for 5 minutes, including for the owner. Admin may manually unblock.
- Alert acknowledgement is atomic: if multiple Teachers acknowledge simultaneously, exactly one succeeds and records who/when; others receive `already acknowledged`.
- Admin can delete a student. Remove face embeddings, card link, private snapshots and associated student biometric data; record `STUDENT_DELETED` audit event identifying actor, target and timestamp. Handle object-storage deletion as part of the workflow, with retry/reconciliation for partial failure.
- A Student cannot open a private snapshot URL even if they know it.
- Show mismatch, spoof and blocked-card history, Admin unblock, Delete Student confirmation and audit trail.

## B9. Level 9 — Occupancy, Live View, Night Watch and Tamper (50 marks)

- Admin saves two camera positions with reference snapshots: `DOOR` (reader-facing) and `ROOM` (seat-facing).
- Teacher selects target position; physical camera is manually re-aimed by hardware teammate/operator within one minute. The site tracks selected/confirmed position.
- Check-in only works at `DOOR`; if current selected camera position is `ROOM`, entry denied with `CAMERA NOT AT DOOR`.
- Admin draws at least two seat zones on ROOM reference image; persist normalized coordinates so layout scales with display dimensions.
- Server-side person counting every 2 seconds using the approved person detector; zone occupied when person centre falls within zone. State changes hold for 3 seconds and appear within 6 seconds.
- Teacher/Admin live view at 2 FPS or higher, with person boxes. Student/Guardian cannot access live view.
- Admin sets room capacity. If count remains above capacity for 3 seconds, show `OVER CAPACITY` on web and local device page and record event.
- Teacher/Admin can enable Night mode. Person remains visible for 3 seconds -> `INTRUDER`; Admin alert and one snapshot within 10 seconds; local page shows `INTRUDER`.
- Do not store counting/live-view frames. Only the single permitted `INTRUDER` snapshot is kept. For camera-fault handling, the paper also requires a fault-moment snapshot and Teacher alert; store only the required fault evidence with restricted access and retention policy.
- Compare each frame at least every 2 seconds with reference snapshot. Detect `COVERED` and `MOVED` within 6 seconds; recover to `OK` within 6 seconds after cause removed. Show actual measured image scores and thresholds live.
- People walking through view must not cause false camera fault.
- On camera fault: Teacher alert within 10 seconds, cyan device light, local `CAMERA FAULT: <state>`, and card check-in denied as `CAMERA FAULT`.
- Show camera position, occupancy count, seat map, capacity, Night mode, intruder alerts, FPS and camera health.

## B10. Level 10 — Own-Trained Hand-Raise Detector (40 marks)

- Team collects at least 100 raised-hand and 100 non-raised-hand images using its camera at ROOM.
- At least 20% held out and never used for training.
- Final classifier must be team-trained; ready-made hand-raise model is not allowed. Training code must remain in repository. A pretrained feature extractor is permitted, but the final classifier is team-trained.
- Build a Model page showing image counts by class, train/validation/test separation, held-out accuracy, confusion matrix and average prediction latency.
- At ROOM, hand held for at least **2 seconds** in seat zone triggers `HAND RAISED – Seat <n>` on Teacher dashboard within 5 seconds, once per raise.
- Dashboard shows today's raises per seat.
- Database event stores seat and time. Device local page's last hand-raise display is hardware/local-page responsibility; website shows the corresponding last event.
- Judged trials: at least 3 of 4 live trials correct; two raises and two other movements; each raise once, correct seat, within 5 seconds.
- Never fabricate image counts, held-out accuracy or confusion matrix. Display `not evaluated` until actual evaluation records exist.

## B11. Level 11 — Wi-Fi CSI Presence and Localization (40 marks)

- Capture CSI on ESP32-S3 from connected AP at **at least 20 packets per second**; send CSI or computed features to backend.
- Camera must remain covered and must not be used for any decision in this level.
- Device and AP remain in fixed positions during collection and tests.
- Presence classification from CSI alone: `EMPTY` / `OCCUPIED`; change only after 3 seconds stable; create `PRESENCE` event.
- Localization grid is **2 × 2**, about 1m per zone, as defined by the individual level.
- Collect labelled CSI samples for each of four zones and empty grid. At least 20% held out from training.
- Team trains localization model; show samples per zone and empty, model/features, held-out accuracy, confusion matrix and measured presence delay.
- Dashboard has a live 2D 2×2 map highlighting predicted zone; update within 3 seconds of each prediction.
- Judged live: EMPTY and OCCUPIED within 5 seconds; at least 3 of 4 zones correct; map within 3 seconds.
- Do not let camera/vision results enter CSI predictions or CSI model inputs.

## B12. Level 12 — Offline, Bluetooth and Power-Cut Recovery (50 marks)

- Dashboard shows connection state `LIVE`, `OFFLINE`, `SYNCING`, `LIVE` and offline blue-heartbeat report (hardware is responsible for LED).
- Device caches UIDs of cards admitted for the class currently running. Offline admission is card-only for those cached cards; record `OFFLINE_ENTRY` with explicit “face not verified” label. No other card or Teacher tag opens door offline.
- After Wi-Fi has been down for 30 seconds, hardware starts its own AP `SmartClass-<TeamID>` using the same password, keeping local status page reachable. Website shows AP availability and pending record count when reported.
- Bluetooth LE state name uses Level 12 individual convention: `SC-<TeamID>-<STATE>` (examples in paper: `SC-T07-OFFLINE`, `SC-T07-FIRE`). Display reported BLE name/state. Do not substitute a conflicting generic BLE name.
- Device persists every telemetry reading/event offline for at least 30 minutes, survives power cut, sends oldest-first after reconnection, preserves original timestamp, and sends each record once. Half-written record is discarded by device.
- Restore door state, fire state, settings, Room ID and Teacher tag list after each restart.
- During the outage video test, a 10-second board power-off must not lose the pending-record count or previously committed events. After reconnection, records must appear once with their original times.
- For a non-default persisted state (for example latched Fire), two consecutive power cuts/restarts must restore agreement between device light, local status page, door and dashboard within 20 seconds after each restart. The website must record the received recovery evidence and show any disagreement instead of masking it.
- Offline entries flagged face-not-verified in dashboard.
- Show queue length, oldest pending timestamp, sync progress, failed/retried records, last successful sync and recovery timeline.
- Website/backend must accept original source timestamp and preserve it; server receipt timestamp is separate.

---

# PART C — HARDWARE / WEBSITE INTEGRATION CONTRACT

This section is essential because one teammate is making hardware and the other is building the website/backend. Implement this contract before building complex pages.

## C1. Contract ownership

Create `/docs/hardware-integration-contract.md` in the repository. It is the shared source of truth between hardware and web/backend teammates.

The web/backend developer owns the HTTP API and publishes the request/response schemas. The hardware teammate confirms the device's actual capabilities, paths, timing and field names. Both teammates approve a version before integrating.

No teammate should invent payload fields independently. Any change requires a contract version update and a sample payload fixture.

## C2. Device registration and credentials

Implement device onboarding with these rules:

- Admin creates a device record, assigns Team ID/device ID and room.
- Backend generates a high-entropy per-device token once.
- Store only a secure hash or equivalent verifier of the token in the database; reveal the raw token only once during controlled provisioning.
- Device token is not the Supabase service-role key and is not a generic shared secret for all devices.
- Device API requests use TLS and authenticate using the per-device credential.
- Support token rotation/revocation and log who did it.
- Do not require the ESP32 to have a Supabase service-role key or unrestricted database access.

## C3. Proposed HTTPS device API

Use these versioned routes unless hardware constraints require a jointly approved alternative:

| Method | Route | Purpose |
|---|---|---|
| `POST` | `/api/device/v1/telemetry` | One telemetry sample |
| `POST` | `/api/device/v1/events` | Immediate event, e.g. `CARD_TAP`, `FIRE`, `PANIC`, `BOOT` |
| `POST` | `/api/device/v1/sync` | Batch offline records, oldest-first |
| `GET` | `/api/device/v1/config` | Fetch latest desired configuration |
| `GET` | `/api/device/v1/commands/next` | Poll pending commands/settings if no push channel is practical |
| `POST` | `/api/device/v1/commands/{commandId}/ack` | Report command received/applied/failed |
| `POST` | `/api/device/v1/face/verify` | Submit cropped face + card UID for owner matching |
| `POST` | `/api/device/v1/camera/analysis` | Submit transient frame/analysis metadata if processing is server-side |
| `POST` | `/api/device/v1/csi/batch` | Submit CSI samples or extracted features |
| `POST` | `/api/device/v1/health` | Health/task/core status if separate from telemetry |

These are proposed website-owned routes, not existing routes guaranteed by the hardware. Confirm them with the firmware teammate before implementation.

## C4. Fixed message contracts

### Telemetry message (Level 2 fixed-data-format boundary)

The shared Section 6 names are snake_case. Preserve these at the wire boundary unless both teammates document a deliberate adapter:

```json
{
  "device_id": "T07-D1",
  "room_id": "ROOM-101",
  "seq": 1048,
  "ts": 1794567890,
  "uptime_s": 742,
  "temp_c": 29.0,
  "rh": 64,
  "heat_index_c": 31.2,
  "flame": false,
  "door": "LOCKED",
  "status": "SAFE",
  "heat_trend": "STABLE",
  "rssi": -61,
  "heap_kb": 182,
  "chip_temp_c": 41.5,
  "fw": "1.0.0",
  "quality": "good"
}
```

### Event message

```json
{
  "device_id": "T07-D1",
  "room_id": "ROOM-101",
  "seq": 1049,
  "ts": 1794567891,
  "type": "CARD_TAP",
  "detail": {
    "uid": "04A1B2C3",
    "source": "RC522"
  }
}
```

All event names must remain exact and case-sensitive. Examples include `BOOT`, `STATUS`, `FIRE`, `FIRE_CLEARED`, `SILENCED`, `PANIC`, `CARD_TAP`, `ENTRY_GRANTED`, `ENTRY_DENIED`, `NO_FACE`, `OFFLINE_ENTRY`, `SENSOR_ERROR`, `SETTINGS_APPLIED`, `OTA_DONE`, `OTA_REJECTED`, `OTA_ROLLBACK`, `UNKNOWN_CARD`, `FACE_MISMATCH`, `SPOOF`, `CARD_BLOCKED`, `STUDENT_DELETED`, `WEATHER_ALERT`, `OCCUPANCY`, `OVER_CAPACITY`, `INTRUDER`, `CAMERA_FAULT`, `CAMERA_OK`, `HAND_RAISED`, `PRESENCE`, `ACK`.

The backend may enrich these events with server-generated IDs, receipt time, actor, room relationship and processing status. It must not rewrite the original device timestamp or sequence.

## C5. Idempotency and sequence rules

- Follow Section 6 identity: `(device_id, seq)` uniquely identifies a device message.
- Device sequence persists across restarts and is never reused.
- Treat telemetry/events as a unified sequence if that is what the firmware teammate implements; confirm this explicitly.
- Use PostgreSQL unique constraints, not only frontend checks.
- If an exact duplicate is received, return an explicit duplicate/already-processed response; do not create a second event.
- If sequence is old but unseen, follow a documented gap/out-of-order policy. Do not silently discard a legitimate offline record solely because it arrives late.
- Preserve `ts` (device event time) and `received_at` (server time) separately.
- For offline batch sync, process oldest-first and return per-record accepted/duplicate/rejected results so the device can safely advance its queue.

## C6. Configuration and command acknowledgement

Use a command/config delivery state machine:

`CREATED → PENDING → DELIVERED → RECEIVED → APPLIED → ACKNOWLEDGED`

Failure paths:

`FAILED`, `EXPIRED`, `REJECTED`, `SUPERSEDED`.

Each command stores: ID, device ID, command type, payload, actor, created time, expiry, delivery attempts, device acknowledgement, result detail and final state.

Device config must carry a monotonically increasing config revision. Device reports its applied revision. The dashboard must distinguish desired config from applied config.

Examples: update room/class parameters, update threshold, teacher tag operation, door override (only where level rules allow), fire reset (only when safe/allowed), weather alert display, OTA request.

Do not expose unsafe generic commands. Use a server-side allowlist and enforce role/safety rules before queuing.

## C7. Face and camera transport

- Face crop is submitted transiently for verification; only the minimum necessary processing data is accepted.
- Do not save Level 7 incoming face crops after verification.
- Enrollment images are used to create embeddings and then deleted.
- Level 8 mismatch snapshots are private and accessible only to authorized Teachers/Admins.
- Level 9 live view must support 2 FPS or higher. Prefer a dedicated stream/worker service or controlled device stream; do not relay an infinite MJPEG response through a short-lived serverless route unless platform limits explicitly support it.
- Counting/live view frames are not stored. Retain only the specific permitted intruder snapshot and required camera-fault evidence.
- Use short-lived signed access or authenticated proxying for private media; never expose public bucket URLs for private images.

## C8. Mock device simulator

Build a development-only device simulator so website/backend work can proceed while the hardware teammate is still implementing the board. It should:

- Send valid telemetry at the Level 2 interval (5 ± 1 seconds).
- Send sample `BOOT`, `CARD_TAP`, `FIRE`, `PANIC`, `ENTRY_GRANTED`, `ENTRY_DENIED`, `SENSOR_ERROR`, `CAMERA_FAULT`, `OCCUPANCY`, `HAND_RAISED`, `PRESENCE`, OTA and OFFLINE events.
- Simulate online/offline and delayed delivery.
- Replay a previously submitted sequence to prove duplicate prevention.
- Simulate out-of-order offline batch sync while preserving original timestamps.
- Use fake/test device credentials only.
- Be disabled in production builds.

The simulator is not evidence that the physical board passed a level.

## C9. Integration handoff checklist for the two teammates

Before testing the real board, both developers must confirm:

- [ ] Device ID and Team ID convention.
- [ ] Room ID source and when it changes.
- [ ] Exact endpoint base URL and API version.
- [ ] TLS certificate validation on device.
- [ ] Authentication header/token format.
- [ ] Exact telemetry and event JSON field names/types.
- [ ] Persistent sequence-number strategy.
- [ ] Device timestamp/NTP behaviour and timezone treatment.
- [ ] Telemetry interval and immediate event-send behaviour.
- [ ] Config polling/command delivery interval.
- [ ] Command acknowledgement format.
- [ ] Offline batch payload and per-record response format.
- [ ] Face crop format, dimensions, maximum payload size and timeout.
- [ ] Camera stream/analysis method and expected frame rate.
- [ ] CSI payload/features and sampling rate.
- [ ] BLE reported device name/status.
- [ ] OTA download URL/authentication/checksum flow.
- [ ] Error codes/retry rules.
- [ ] Sample payloads captured from actual firmware.

---

# PART D — DESIGN SYSTEM AND UX REQUIREMENTS

## D1. Visual direction

Use **Atmospheric Minimalism + Swiss Design + Bento UI + Subtle Glassmorphism**. The master blueprint's alabaster/indigo/pastel direction is the preferred foundation.

Design tokens:

- Canvas: `#F4F6FB`.
- Main card: `#FFFFFF`.
- Main border: `#E2E8F0`.
- Primary indigo: `#4F46E5`.
- Primary hover: `#4338CA`.
- Attendance periwinkle: `#EEF2FF`.
- Environmental cyan: `#ECFEFF`.
- Positive mint: `#ECFDF5`.
- Warning amber: `#FFFBEB`.
- Safety coral: `#FFF1F2`.
- Primary text: `#0F172A`.
- Secondary text: `#475569`.

Typography:

- Plus Jakarta Sans or Inter for interface.
- JetBrains Mono for telemetry, timestamp, RSSI, memory, FPS and latency.
- Use tabular numerals for measurements.

Use spacious layouts, excellent hierarchy, consistent radii, subtle shadows and understated micro-interactions. Avoid generic neon cyberpunk visuals, excessive glass blur, dense gauges, pointless gradients and dashboard clutter.

## D2. Navigation and application structure

Create a role-aware sidebar and header, not a cramped five-tab header.

Suggested Admin/Teacher navigation:

- Overview.
- Rooms & Classes.
- Attendance.
- Safety Centre.
- Access & Identity.
- Vision & Occupancy.
- Analytics & Reports.
- Weather & Notices.
- AI Assistant (Teacher/Admin as permitted).
- Devices.
- Configuration (Admin only).
- Firmware & OTA (Admin only).
- AI Model Lab (authorized roles only).
- Judge & Evidence Centre (competition operator/Admin).
- Audit Logs (Admin only).

Student and Guardian navigation must be significantly smaller and must not merely hide restricted content while leaving APIs accessible.

## D3. Required application routes/pages

Build these progressively, with permission-aware server layouts:

### Authentication
- `/login`
- `/forgot-password`
- `/reset-password`
- `/invite/accept`

### Admin and Teacher platform
- `/overview`
- `/rooms`
- `/rooms/[roomId]`
- `/rooms/[roomId]/safety`
- `/rooms/[roomId]/attendance`
- `/rooms/[roomId]/vision`
- `/rooms/[roomId]/history`
- `/attendance`
- `/students`
- `/students/[studentId]`
- `/access/cards`
- `/incidents`
- `/weather`
- `/analytics`
- `/reports/daily`
- `/assistant`
- `/devices`
- `/devices/[deviceId]`
- `/devices/[deviceId]/configuration`
- `/devices/[deviceId]/ota`
- `/models/hand-raise`
- `/models/wifi-csi`
- `/settings/users`
- `/settings/roles`
- `/settings/audit`
- `/judge`
- `/judge/levels/[levelNumber]`
- `/judge/evidence`

### Student
- `/student/dashboard`
- `/student/attendance`
- `/student/schedule`

### Guardian
- `/guardian/dashboard`
- `/guardian/children/[studentId]`
- `/guardian/attendance`
- `/guardian/notifications`

### Local page link
The local device status page belongs to the hardware teammate. The website can display a clearly labelled link using the reported mDNS/IP address, but must not pretend the local page is hosted by Vercel.

## D4. Dashboard design

Create a command-centre overview with:

- School/room selector and date/time.
- Connection and freshness indicator.
- Attendance Present/Late/Absent counts.
- Temperature, humidity and heat index.
- Safety state, fire/panic incident banner and simulated door state.
- Device health summary.
- Last card/check-in activity.
- Environmental trend chart.
- Weather/notice summary.
- Occupancy/capacity summary when Level 9 is enabled.
- Latest events timeline.

Use a desktop-first 12-column bento layout that adapts to tablets and phones. Do not force everything above the fold at the expense of usability. Safety banner must remain visible and must not be hidden by scrolling when active.

## D5. Reusable components

Create a component library with:

- `MetricCard`
- `DeviceStatusBadge`
- `ConnectionPill`
- `DataFreshnessLabel`
- `SafetyStateBanner`
- `IncidentTimeline`
- `TelemetryChart`
- `EventTable`
- `AttendanceTable`
- `StudentProfileCard`
- `RoomSelector`
- `DeviceHealthPanel`
- `HardwareSignalList`
- `CameraViewport`
- `CameraFaultOverlay`
- `SeatMapEditor`
- `SeatOccupancyMap`
- `WeatherNoticeCard`
- `CommandStatusStepper`
- `ConfigRevisionHistory`
- `OtaReleaseCard`
- `ModelMetricPanel`
- `ConfusionMatrix`
- `CsiZoneMap`
- `EvidenceChecklist`
- `Stopwatch`
- `CsvExportControl`
- `ConfirmDestructiveActionDialog`

All components must support real data and states. Do not hardcode sample values in production UI.

## D6. Internationalization

- English and Bangla across every dashboard page and navigation item.
- Central translation keys; no scattered inline text that cannot be translated.
- Keep event codes and machine values unchanged; translate their human labels/descriptions.
- Render timestamps in Asia/Dhaka for user-facing classroom time when appropriate; retain UTC in database/API.
- Ensure Bengali fonts and line heights look polished.

---

# PART E — MASTER PROMPTS (RUN IN ORDER)

Each prompt below is intended to be pasted separately into Cursor, Windsurf, Claude Code or another coding agent while this master file is available in the workspace. Do not ask the coding agent to build every prompt in one run.

## PROMPT 00 — Lead Architect and Repository Auditor

```text
You are the Staff Full-Stack Architect and Technical Lead for FastRobox 1.0 SmartClass. Read this entire master prompt file and both source project documents before coding.

My responsibility is the WEBSITE AND BACKEND. A separate teammate is implementing ESP32-S3-CAM firmware and electronics. Do not write firmware, GPIO wiring, local ESP32 HTML, LED/buzzer logic or claim to control physical hardware directly. Build the public HTTPS website, backend, database, realtime, notifications, APIs and integrations that communicate with that hardware.

IMPORTANT REQUIREMENT PRECEDENCE: Follow each individual Level 1–12 description where it conflicts with shared/generalized text. Use the level-specific values in Part B. Do not replace them with conflicting generalized values. Preserve all non-conflicting requirements.

Your first job is repository reconnaissance, not code generation:
1. Inspect the project files, package manager, existing dependencies, routes, styles, Supabase setup, database migrations and deployment configuration.
2. Identify what already works and what must be preserved.
3. Create a requirements traceability matrix with every Level 1–12 website/backend requirement, the page/API/table/service that will satisfy it, the hardware dependency and its verification test.
4. Identify all unanswered hardware integration decisions and place them in `/docs/hardware-contract-open-questions.md`.
5. Draft `/docs/system-architecture.md`, `/docs/hardware-integration-contract.md`, `/docs/requirements-traceability.md` and `/docs/implementation-roadmap.md`.
6. Establish a feature-based folder architecture appropriate to the repository.
7. Propose milestones and dependencies. Do not generate all pages at once.

Technology baseline: Next.js 15 App Router, TypeScript, Tailwind, Supabase PostgreSQL/Auth/Realtime/Storage, Vercel, Zod, Recharts, Lucide and React Hook Form unless the existing project has a justified working equivalent.

Security rules: no service-role key in browser; no secrets in Git; device-specific credentials; server-side role authorization; RLS; input validation; idempotent device ingestion; private biometric snapshots; no persistent storage of ordinary camera frames.

Return:
- repository assessment;
- architecture proposal;
- exact milestone order;
- source-level conflicts interpreted using individual level text;
- hardware teammate dependency list;
- files you intend to create next.

Do not begin a large implementation until the contract and roadmap documents are coherent. If the repository is empty, scaffold only the minimum base required for Prompt 01.
```

## PROMPT 01 — Hardware/API Contract, Typed Schemas and Mock Device

```text
Act as a Senior IoT API Architect. Implement the hardware-to-cloud integration contract for SmartClass. The ESP32 hardware is owned by another teammate. Your output must make it possible for that teammate to send data to the website without guessing field names or endpoint behaviour.

Read Part B and Part C of this master document. Individual-level requirements take precedence. In particular Level 2 uses the Section 6 fixed message data format, telemetry at 5 ± 1 seconds, SmartClass-<TeamID> AP at 192.168.4.1, and smartclass-<teamid>.local for mDNS.

Tasks:
1. Finalize `/docs/hardware-integration-contract.md` with endpoint base URL, API version, authentication, headers, exact request/response examples, error codes, retries, timeouts, max payload sizes, sequence rules, timestamp rules, config revisions and offline batch semantics.
2. Use the Level 2 fixed wire names and types at the device boundary: device_id, room_id, seq, ts, uptime_s, temp_c, rh, heat_index_c, flame, door, status, heat_trend, rssi, heap_kb, chip_temp_c, fw, quality. Event shape: device_id, room_id, seq, ts, type, detail. Do not silently convert or discard fields.
3. Define Zod schemas for telemetry, all supported event types, face verification request/result, configuration response, command response/ack, offline batch and CSI payload.
4. Create strict TypeScript domain types. Normalize wire names into a canonical frontend model in one explicit adapter. Preserve raw payload JSON for audit/debug.
5. Implement proposed versioned routes: POST telemetry, POST events, POST sync, GET config, GET next command, POST command acknowledgement, POST face verification, POST camera analysis, POST CSI batch and POST health. Keep route handlers thin; call domain services.
6. Add a per-device token auth middleware. Token must be device-specific, stored hashed/securely verifiable, revocable and never available to browser bundles. Do not use Supabase service role as an ESP32 credential.
7. Use one device message sequence strategy and document whether telemetry/events share the sequence namespace. Apply unique `(device_id, seq)` idempotency in persistence.
8. Separate device event time (`ts`) and server receipt time (`received_at`). Preserve original timestamps on delayed/offline sync.
9. Return explicit results for each offline batch item: accepted, duplicate, rejected and reason. A duplicate must never create a second DB record.
10. Build a development-only mock ESP32 simulator that can send telemetry every 5 ± 1 seconds, send event samples, go offline, replay messages, send delayed/out-of-order records and batch-sync them. It must use test credentials and be disabled in production.
11. Supply ready-to-share JSON fixtures for the hardware teammate and a curl/Postman collection or equivalent.
12. Create a contract compatibility test that validates sample payloads exactly. If teammate firmware uses a different casing or endpoint, update only the adapter/contract through an agreed version change.

Important: the device is responsible for physical sensing, face detection, safety decisions, LED/buzzer, BLE, CSI capture, camera capture and local AP. The backend validates, stores, coordinates and reports those device results.

Acceptance:
- actual JSON fixtures validate;
- bad token rejected;
- unknown fields handled according to documented strictness;
- duplicate `(device_id, seq)` is not inserted twice;
- out-of-order offline records retain original `ts`;
- mock device can drive the dashboard without hardware;
- OpenAPI or equivalent API documentation is generated and current.

Implement, test, document and summarize. Do not invent hardware details that the teammate has not confirmed.
```

## PROMPT 02 — Supabase Database Architecture and Migrations

```text
Act as a Principal PostgreSQL/Supabase Database Architect. Design and implement the production-quality database for SmartClass covering all 12 levels.

Do not keep the original four-table prototype as the entire schema. Build a normalized domain model. Use UUID primary keys where appropriate, foreign keys, indexes, check constraints, unique constraints, timestamps, and transactional functions for security-critical operations. Do not overuse JSONB as a substitute for relational modelling; reserve JSONB for genuinely variable event detail/raw payload metadata.

Required domains and tables (you may refine names while preserving relationships):
A. Institution: schools, rooms, room memberships, class_sessions, class_enrollments.
B. Identity: user_profiles, user_roles or authoritative role claims, guardian_student_links, students, consent_records, student_cards, face_embeddings.
C. Device: devices, device_credentials, device_configurations, device_config_history, device_message_inbox, telemetry_readings, device_events, device_health_snapshots.
D. Operations: device_commands, command_acknowledgements, ota_releases, ota_jobs.
E. Safety: security_incidents, incident_acknowledgements, blocked_cards, notifications, notification_deliveries, login_attempts, audit_logs.
F. Vision: camera_positions, seat_zones, occupancy_events, camera_health_events, handraise_events.
G. ML/CSI: model_runs, model_metrics, handraise_dataset_versions or dataset summaries, csi_samples or aggregated CSI feature records, csi_predictions, presence_events.
H. Weather and reporting: weather_cache, weather_notices, daily_reports or report views/materializations.
I. Competition: competition_levels, level_test_runs, level_test_results, evidence_artifacts, level_code_references.

Mandatory integrity rules:
1. Unique `(device_id, seq)` in device_message_inbox for telemetry/event replay prevention.
2. Unique `(class_session_id, student_id)` in attendance records.
3. Unique acknowledgement per incident (atomic concurrent Ack).
4. Unique active card mapping as per project rules; card blocking expiry and manual unblock audit.
5. Device config revision is monotonically increasing per device.
6. Preserve device source time and server receive time separately.
7. Store private file object keys rather than public snapshot URLs.
8. Biometric records are isolated and deletable. Enrollment photos are transient and not stored permanently.
9. Student deletion must be able to remove embeddings, card mapping and associated private snapshots, and create a minimal audit record without retaining deleted biometric data.
10. Add indexes for room/time event queries, attendance/class, device/time telemetry, user/room permissions and notification state.
11. Use database transactions or SQL functions for acknowledge, student deletion orchestration, card-block state and attendance deduplication.
12. Create migrations in `/supabase/migrations`; no undocumented manual-only SQL.

RLS and authorization:
- Default deny for exposed tables.
- Admin: school scope.
- Teacher: assigned rooms/classes only.
- Student: own attendance only.
- Guardian: linked children only.
- Student/Guardian cannot query events/history/reports/assistant, private snapshots or live camera.
- Teacher cannot access Admin-only OTA/settings/user administration.
- Device API writes go through trusted server validation or narrowly scoped device policies; never use permissive anonymous write policies.
- Supabase secret/service-role key remains server-side only.

Also implement:
- Supabase Realtime publication only for tables whose changes must reach authorized clients.
- Private Storage buckets for permitted mismatch/intruder/camera-fault snapshots and firmware.
- Storage access rules and signed URL policy.
- Data-retention/cleanup policy for permitted snapshots and transient biometric processing artifacts.
- Seed scripts for test roles, rooms, one device and judge scenario data only in development/test environment.
- A schema ERD in Mermaid and a data dictionary.
- Tests for RLS, unique constraints, concurrency, deletion and idempotency.

Do not create fake sample production readings. Add realistic fixtures only to a clearly isolated development/test seed.

Return migration order, key relationships, indexes, RLS policy matrix and test commands. Implement migrations and run all available database tests.
```

## PROMPT 03 — Authentication, Roles, RLS and Onboarding

```text
Act as a Senior Application Security Engineer and Next.js Auth Architect. Implement secure identity, login, role enforcement and first-time setup.

Required roles: Admin, Teacher, Student, Guardian. Use the exact permissions in Level 4 and this master document. Every protected server request must check identity, role and resource scope. Hiding a button is not authorization.

Requirements:
1. Supabase Auth for account identity. Passwords must never be stored in plaintext or custom application tables. Use the secure supported password hashing/authentication path.
2. Server-side auth session handling appropriate for Next.js App Router; protect server routes and server actions.
3. Role and room/class membership model with clear permission helper functions.
4. RLS policies for room, classroom, student, attendance, event, report, snapshot, device and audit data.
5. Guardian can access only linked children. Student sees only own attendance. Teacher sees only assigned classes/rooms. Admin has school-level control.
6. Level 4 login lockout: 5 incorrect passwords consecutively -> reject correct password for 30 seconds. Track user/time/success/failure. Do not weaken Supabase Auth; implement an appropriate server-side rate/lock policy or auth provider-supported mechanism that cannot be bypassed by changing the frontend.
7. Admin login-attempt history page/API.
8. Judge test accounts: Admin, Teacher, Student S1, Student S2, Guardian linked only to S1. Create via development seed or secure setup script; no public fixed passwords.
9. Onboarding flow: create school, rooms, devices, device token, users, teacher room membership, class schedule, students and Guardian relationships.
10. Device credential lifecycle is separate from human user sessions: create, hash/store verifier, reveal once, rotate, revoke, audit.
11. Login, logout, denied page, session expiry, account lockout and invitation states need polished UX.
12. Create automated authorization tests for direct API access and database RLS. Include attempts to read another student's attendance, another Guardian's child, Teacher-only pages as Student, Admin settings as Teacher and private snapshot as Student.

Internationalization: all auth and role-aware navigation text must support English and Bangla from the first implementation.

Acceptance: role tests pass at server and database levels. Unauthorized requests return 401/403 with no protected data, even if manually crafted. Do not leak whether private student records exist.
```

## PROMPT 04 — Device Ingestion, Realtime, Configuration and Commands

```text
Act as a Senior Backend Engineer for reliable IoT systems. Implement device ingestion and bidirectional command/configuration management using the approved hardware contract.

The ESP32 teammate owns hardware logic. You own the secure cloud side.

Device ingestion:
1. Validate device token, device registration, room assignment and payload schema.
2. Accept Level 2 telemetry every 5 ± 1 seconds and immediate event messages.
3. Validate `device_id`, `room_id`, numeric ranges/types, source sequence and timestamp. Do not silently convert impossible temperature/humidity into valid readings.
4. Enforce idempotency using unique `(device_id, seq)`.
5. Preserve raw wire payload, parsed/normalized values, `ts`, `received_at`, firmware and data quality.
6. Reject replay/duplicate messages explicitly. Accept legitimate delayed offline messages under documented sequence rules.
7. Do not create duplicate card tap, status, fire, panic or OTA event records.
8. Mark device offline within 30 seconds of its heartbeat going silent; online when valid heartbeat returns. Distinguish offline from delayed/stale telemetry.
9. Handle backend restart and device retry safely.
10. For offline batch sync, accept original timestamps, process oldest-first, return per-record outcomes, and mark synchronized status.

Configuration:
1. Store desired config separately from last device-applied config.
2. Increment configuration revision on every accepted change.
3. Deliver new Level 5 limits within 10 seconds using an appropriate config poll/command mechanism.
4. Store who changed each setting and when; reject invalid temperature outside 0–50°C or Warning >= Danger.
5. The hardware reports `SETTINGS_APPLIED` and applied revision; update UI only after acknowledgement.

Commands:
1. Durable command queue with allowlisted command types.
2. Command lifecycle: PENDING, DELIVERED, RECEIVED, APPLIED, ACKNOWLEDGED, FAILED, EXPIRED, REJECTED, SUPERSEDED.
3. Record actor, target device, payload, timestamps, expiry, attempts and result.
4. Prevent unsafe command execution. Fire reset is allowed only for Teacher/Admin and only after device confirms flame is gone; never clear a fire latch remotely during active flame.
5. Send weather Danger notice to device within 10 seconds.
6. Send OTA release instructions only to authorised devices.
7. Expose API for device polling and acknowledgement, with retry/backoff.

Realtime:
- Publish authorized changes for device state, telemetry, incidents, attendance, alerts, commands and sync progress.
- Avoid subscribing every page to every table.
- Reconcile state after reconnect; Realtime is a notification transport, not the only source of truth.
- Record measured publish-to-client latency where possible; do not label it a guaranteed <50ms.

Create device service modules, queue processor, route handlers, Zod validation, tests, simulator support and API documentation. Include a real-world integration test plan using actual device payload fixtures.
```

## PROMPT 05 — Frontend Foundation, Design Tokens and App Shell

```text
Act as a Principal Product Designer and Staff Frontend Engineer. Build the SmartClass frontend foundation from the design system in Part D.

Use Next.js 15 App Router, TypeScript, Tailwind, Lucide, Recharts, React Hook Form and Zod as appropriate. Inspect current project conventions first.

Design direction: Atmospheric Minimalism, Swiss Design, high-craft light-mode EdTech, subtle glassmorphism, restrained pastel semantic cards, generous whitespace and consistent bento composition. Base canvas #F4F6FB, white cards, indigo #4F46E5, soft periwinkle/cyan/mint/amber/rose semantic tints. Typography Plus Jakarta Sans/Inter with JetBrains Mono for technical values.

Build:
1. Global tokens for colour, spacing, radius, shadow, typography and focus.
2. Accessible base components: buttons, inputs, selects, dialogs, cards, badges, tabs, tooltips, toasts, tables, skeletons and empty states.
3. Application shell with role-aware collapsible sidebar and top header.
4. Header with school/room selector, time/date, live connection/freshness pill, notification centre, EN/বাংলা toggle and profile menu.
5. Responsive layouts for desktop, tablet and mobile.
6. Four distinct navigation configurations for Admin, Teacher, Student and Guardian.
7. Shared components listed in Part D5. Implement real typed props and data states.
8. Reusable page title/breadcrumb/action bar.
9. Loading, empty, error, offline, stale, permission-denied, success and retry states.
10. Accessible focus, contrast, keyboard operation and reduced-motion support.
11. Internationalization from the start; translations must include every visible label and menu item.
12. Do not build fake live data into production components. Use explicit fixture providers for Storybook/demo/test if available.

First deliver a complete responsive shell and component showcase page. Then build only the overview route scaffold. Do not add all feature pages in this prompt.

Acceptance:
- `npm run lint`, typecheck and build pass;
- sidebar and header work on mobile/tablet/desktop;
- language switch affects the entire shell;
- unauthorized nav items are omitted but server route checks remain separately implemented;
- no layout shifts from telemetry number changes;
- all interactive controls work and are not decorative.
```

## PROMPT 06 — Command Centre and Room Operations Dashboard

```text
Act as a Senior Frontend Product Engineer. Build the Admin/Teacher Command Centre using actual backend services and realtime subscriptions.

Route: `/overview` and room-specific `/rooms/[roomId]`.

Dashboard must answer within about five seconds: Is the classroom safe? Is the device connected? What is the attendance? Is there a live incident? Is the data current?

Layout:
- Top: school/room selector, current date/time, connection/freshness, notifications.
- KPI cards: Present/Late/Absent, temperature, humidity, heat index, door state, safety state.
- Device health summary: last seen, uptime, RSSI, heap, chip temperature, firmware and last reset reason.
- Telemetry chart: temperature/humidity/heat index across configurable periods up to 24h.
- Latest classroom activity timeline: RFID, attendance, status changes, FIRE/PANIC, weather alert, OTA and device connection events.
- Weather and active notice widget.
- Occupancy/capacity widget when level is enabled.

Requirements:
1. Use typed room hooks/services. Do not create one massive `useSmartClassroom` hook.
2. Use initial server data where appropriate, then narrow Realtime subscriptions for relevant records.
3. Render device states as `ONLINE`, `OFFLINE`, `DELAYED`, `STALE`, `UNKNOWN` with last-seen time. A stale value must never look live.
4. Display `SAFE`, `WARNING`, `DANGER`, `FIRE`, `PANIC` with severity hierarchy. Active Fire/Panic banner is persistent and high contrast across every logged-in dashboard required by Level 3/4.
5. Simulated door is explicitly labelled simulated. Show LOCKED/UNLOCKED and last source event/command acknowledgement.
6. Admin/Teacher permission differences must be correct. Reset fire only for Teacher/Admin and only if backend/device safety conditions allow.
7. Room dashboard updates within 3 seconds of new data. Measure client receipt time and show diagnostics; don't fake latency.
8. Empty/loading/offline/error states are polished and actionable.
9. Do not use demo values as if they came from hardware.
10. Include a development-only simulated data mode banner if mock device is active.

Provide screenshots or visual test snapshots if the repository has Playwright. Add tests for room selection, freshness labels, fire/panic banners, role-specific actions and Realtime reconnect reconciliation.
```

## PROMPT 07 — Attendance, Student Profiles, Cards and Guardian Portal

```text
Act as a Senior EdTech Product Engineer and Backend Developer. Implement Level 4 role-limited pages and Level 7 card/face attendance workflows, followed by the Level 8 security UI foundations.

Frontend pages:
- `/attendance`
- `/rooms/[roomId]/attendance`
- `/students`
- `/students/[studentId]`
- `/access/cards`
- `/guardian/dashboard`
- `/guardian/children/[studentId]`
- `/guardian/attendance`
- `/student/dashboard`
- `/student/attendance`

Admin workflow:
1. Create/edit student profile and assign class.
2. Present clear biometric consent notice and record consent version/time/actor.
3. Enroll at least 3 face images per student. Submit them to a trusted embedding service; delete originals immediately after successful processing. If the inference service is unavailable, show pending/failed and securely clean up temporary uploads; do not mark enrollment complete.
4. Store face embeddings in protected storage/table. Do not expose embeddings to browser.
5. `Register card` starts a pending card-link operation. UI waits for device `CARD_TAP` event, then links UID to selected student. Support replace/remove.
6. Display enrollment status, registered card, class membership and consent.

Attendance logic from Level 7:
- Verify tapped card maps to student.
- Verify submitted face belongs to that card owner.
- Verify student belongs to currently running class in this room.
- If face absent within 3s, device denies locally; backend records resulting `NO_FACE` event if received.
- Present within first 10 minutes; Late after that; Absent after 30 minutes for enrolled students not checked in.
- One attendance row per student per class. Repeat check-in may unlock door but must not add another attendance record.
- Door unlock result must arrive within 5 seconds; UI shows pending decision and actual grant/denial, not a fabricated instant grant.
- Denial reasons: NO FACE, NOT IN THIS CLASS, NO CLASS NOW, UNKNOWN CARD.
- Guardian notification for Late/Absent within 60 seconds.

Guardian portal:
- Only linked children.
- Show today's arrival/entry time, attendance history, Late/Absent notices.
- No camera, event history, report or AI assistant access.
- Guardian can never retrieve another child's existence or data through URL/API manipulation.

Student portal:
- Own attendance only and explicitly permitted personal features.
- No room history, live camera, reports, private snapshots or AI assistant.

Level 8 UI foundations:
- Teacher/Admin mismatch alert with private snapshot.
- Three mismatches for same card within 2 minutes => block for 5 minutes; Admin Unblock action.
- Atomic Ack status and clear already-acknowledged response.
- Admin Delete Student action with precise confirmation; backend removes embeddings/card links/snapshots and logs deletion.

Use server-derived attendance states and timestamps. Build RLS and API tests alongside screens. Add English/Bangla labels. Do not save incoming face crops after matching; do not expose face embeddings to the client.
```

## PROMPT 08 — Safety Centre, Incidents, Notifications, Settings and OTA

```text
Act as a Senior Safety Platform Engineer. Implement the web/backend operations for Levels 3, 4, 5 and 8. The hardware teammate implements the physical safety response; your role is to receive, store, command where permitted and accurately display device-reported states.

Pages:
- `/rooms/[roomId]/safety`
- `/incidents`
- `/devices/[deviceId]/configuration`
- `/devices/[deviceId]/ota`
- `/settings/audit`

Safety state rules from individual Level 3:
- WARNING enter >=32°C OR humidity >=85%; leave <=30°C AND humidity <=80% (apply the described 2°C hysteresis carefully).
- DANGER enter >=40°C; leave <=38°C.
- New ordinary status must remain for 3 seconds before change event.
- Invalid readings: temp outside 0–50°C or humidity outside 20–90%; set quality bad, preserve last accepted status, exclude impossible value from normal calculations.
- Heat index formula and version must be recorded; heat trend from last 10 accepted temperatures; trend never changes door/light/buzzer.
- FIRE requires flame continuous for 2 seconds; it is immediately latched, device must unlock simulated door and alarm; cloud receives FIRE within 3 seconds; persists across power cut.
- Only Teacher/Admin Reset fire after flame is gone; Student cannot silence; never clear active flame from website.
- PANIC: touch <1 second ignored; 2-second touch raises PANIC; event cloud within 3 seconds.
- Red FIRE/PANIC banner on logged-in dashboards within 3 seconds.

Incident Centre:
- Incident detail timeline with event time, received time, room/device, severity, current state, door state and actions.
- Acknowledge button only for permitted users. Use atomic database transaction; exactly one Ack per incident.
- Reset fire requires role + active flame check + device command/ack. Clearly separate acknowledge notification from clearing fire state.
- Preserve event detail and source payload.

Notifications:
- Deliver FIRE, PANIC and Heat Danger to Teacher phone via one configured channel (email/Telegram/push) within 10 seconds.
- Guardian Late/Absent notices are handled in attendance module.
- Weather Danger notification to every dashboard/device within 10 seconds.
- Store notification provider, recipient, delivery attempt, sent/delivered/failed status and timestamp. Provide retry without duplicate notifications.

Level 5 Admin settings:
- Warning default 32°C; Danger default 40°C.
- Accept only 0–50°C and Warning < Danger.
- Changes applied on device within 10 seconds; store actor, old/new values and revision.
- Teacher cannot access settings.

OTA:
- Admin-only upload of working higher-version binary, damaged test binary and intentionally faulty test binary.
- Private storage, file size/type check, SHA-256/checksum, version, uploader and upload time.
- Durable OTA job and device command state.
- Track device OTA progress/status, installed firmware version, `OTA_DONE`, `OTA_REJECTED` and `OTA_ROLLBACK`.
- Damaged binary rejection and rollback are device behaviours; website only marks them proven after actual matching device events and test evidence.
- Rollback target is previous valid firmware; faulty image must roll back if server not reachable within 60 seconds after boot.

Use safe defaults, confirmation for destructive/critical operations, server-side permissions, idempotent event/notification handling and tests for every rule. Do not implement a generic button that bypasses device safety logic.
```

## PROMPT 09 — Weather, History, Reports, CSV and Grounded AI Assistant

```text
Act as a Senior Data Platform Engineer and Product Designer. Implement all Level 6 website/backend features. Follow the individual Level 6 weather fetch interval of 15 minutes.

Pages:
- `/weather`
- `/rooms/[roomId]/history`
- `/analytics`
- `/reports/daily`
- `/assistant`

Weather:
1. Create server-side weather provider adapter for a public weather service; API key stays server-side.
2. Fetch current conditions and next 24 hours every 15 minutes.
3. Cache results in database with provider, fetched_at, valid time range and raw/source metadata.
4. Notice board categories: storm, cyclone, heavy rain/flood, heatwave.
5. Severity: Advisory, Warning, Danger; show source, time window and whether official alert or forecast-derived estimate. Label derived warnings honestly.
6. Admin can create/delete TEST notice.
7. Danger notice must reach all logged-in dashboards within 10 seconds and be queued to devices; dashboard shows delivery state.
8. If service fails, show last data + age + `Data stale`. Never display stale data as fresh.

History:
- Filter event type and date/time range.
- Show event timestamp, receipt time, device, room, type, severity, detail and offline-sync indicator.
- Filters must query server/database, not download all events to browser.

Charts:
- Temperature, humidity and heat index from stored telemetry for chosen period up to last 24 hours.
- Correct axes, units, missing-data gaps and tooltip timestamps.
- No invented interpolation or fake data.

Daily report for chosen date:
- Minimum, maximum and average temperature/humidity.
- Alarm counts by type.
- Attendance Present/Late/Absent (zero before attendance level exists, but clearly label feature not yet implemented where relevant).
- Use the same calculation logic as AI assistant queries.

CSV:
- Export filtered event list, selected-period sensor readings and daily report.
- CSV must match the current filter/date selection exactly.
- Add safe quoting, UTF-8 and appropriate permission checks.

AI assistant:
- English and Bangla question input.
- Teacher/Admin only as allowed by Level 6; Teachers see only assigned rooms.
- Only answer from stored classroom data using parameterized, read-only query tools or controlled analytics functions.
- Never let LLM generate arbitrary SQL or query other rooms.
- Return answer plus cited source rows/metrics and date range.
- If no data exists, respond clearly `No data available`; never infer or hallucinate.
- AI result must match daily report calculations.
- Log query metadata safely; avoid storing unnecessary sensitive prompts/PII.

Add tests for stale weather, official-vs-derived labels, CSV consistency, timezone boundaries, report calculations, permission restrictions and no-data assistant response.
```

## PROMPT 10 — Vision, Occupancy, Camera Health and Hand-Raise Model Lab

```text
Act as a Senior Computer Vision Product Engineer. Implement the website/backend integration and visual management for Levels 7, 8, 9 and 10. The hardware/AI teammate or a separate inference service supplies actual detections and predictions. Do not fabricate computer-vision outputs or claim a model is trained when it is not.

Pages:
- `/rooms/[roomId]/vision`
- `/models/hand-raise`
- student enrollment and face verification views from Prompt 07

Camera positions:
- Admin defines DOOR and ROOM reference positions/snapshots.
- Teacher selects active position; show selected, pending physical re-aim, confirmed position and timestamp.
- If active position ROOM, card check-in must be denied as CAMERA NOT AT DOOR.

Seat-zone editor:
- Draw at least two zones on ROOM reference image.
- Store normalized polygon/rectangle coordinates with version, image dimensions and editor.
- Show zones and occupancy overlay without mutating source reference image.
- Support rename, move, resize, delete and save confirmation.

Occupancy:
- Accept server person count every 2 seconds.
- Zone occupied when detection centre lies inside zone.
- Only change after stable for 3 seconds; reflect on dashboard within 6 seconds.
- Admin sets room capacity; over capacity held 3 seconds -> `OVER CAPACITY` event and banner.
- Display confidence/model version and timestamp if supplied by inference service.

Live view:
- Teacher/Admin only.
- 2 FPS or more.
- Show FPS, stream health, camera position and detected person boxes.
- Students/Guardians receive hard authorization denial.
- Do not persist counting/live frames.
- Prefer a dedicated stream/inference path. Do not route a persistent MJPEG stream through a serverless handler unless platform supports it.

Night Watch:
- Teacher/Admin toggle.
- Person present for 3 seconds -> INTRUDER.
- Admin alert within 10 seconds, one permitted intruder snapshot, local status indication via device integration.
- Snapshot private and auditable.

Camera tamper/health:
- Compare incoming camera frame (minimum check every 2 seconds) to selected reference position.
- Detect COVERED/MOVED within 6 seconds; recover OK within 6 seconds after cause removed.
- Show actual cover/move score, threshold, timestamp and camera status.
- Prevent people walking through view from creating false faults.
- Camera fault produces Teacher alert within 10 seconds and the required fault-moment snapshot with restricted access.
- If fault active, check-in denied as CAMERA FAULT.

Hand-raise Model Lab:
- Team dataset at least 100 raised and 100 not-raised images.
- Show training/held-out split; held-out >=20% and never included in training.
- Final classifier must be team-trained. Display model version, training date, dataset version, class counts, held-out accuracy, confusion matrix and average prediction time.
- At ROOM, hand held >=2 seconds in seat zone => HAND RAISED – Seat <n> on Teacher dashboard within 5 seconds, once per raise.
- Today's count per seat.
- Store event, seat and timestamp. Model outputs must be actual inference results.

Privacy:
- No retained regular live-view/counting frames.
- Store only specifically permitted intruder snapshot and camera-fault evidence.
- Keep access log and retention configuration for private images.
- Avoid using student identities in occupancy unless explicitly required; prefer aggregate seat occupancy.

Build mock inference fixtures only for development/test, clearly labelled synthetic. Add integration adapters so actual inference service can replace mock provider without frontend rewrite.
```

## PROMPT 11 — Wi-Fi CSI Model Lab and 2×2 Presence Map

```text
Act as a Senior IoT Data/ML Platform Engineer. Implement the Level 11 CSI frontend/backend integration. The camera must not contribute to any Level 11 decision.

Pages:
- `/models/wifi-csi`
- CSI panel within `/rooms/[roomId]/vision` or a dedicated `/rooms/[roomId]/presence` view.

Requirements:
1. Accept CSI packets or device-computed features from ESP32 at >=20 packets/second, with packet rate and loss counters.
2. Preserve source device/time, Wi-Fi channel, subcarrier metadata and model/dataset version where supplied.
3. Camera must be covered and excluded from decision inputs. Record the camera-covered test condition.
4. Presence classification EMPTY/OCCUPIED must hold 3 seconds before event; create PRESENCE event on stable state change.
5. Localization uses the individual Level 11 2×2 floor grid; four approximately 1m zones plus empty-grid class.
6. Provide labelled sample collection workflow for each zone and empty state.
7. Held-out data >=20%, never used in training.
8. Model page: sample count per zone and empty, feature description, model version, train/test split, held-out accuracy, confusion matrix and measured presence delay.
9. Live 2D 2×2 map; highlight predicted zone and timestamp; update within 3 seconds.
10. Judged criteria tracking: EMPTY/OCCUPIED within 5s and at least 3 of 4 zones correct.
11. Do not use camera/person detections, image embeddings or camera-derived occupancy to fill CSI values or predictions.
12. Do not fabricate sample totals, confusion matrix, accuracy or prediction results. Show not-yet-collected/not-evaluated states.

Store training metadata and samples/features with enough provenance to reproduce evaluation. Keep large raw CSI payload retention configurable; document data volume and retention. Add API/DB tests for rate, schema, zone labels and held-out split metadata.
```

## PROMPT 12 — Offline Sync, BLE Status, Recovery Dashboard and Evidence Centre

```text
Act as a Principal Reliability Engineer and Competition Operations Product Designer. Implement the web/backend half of Level 12 plus the Judge & Evidence Centre for all levels.

Offline/resilience:
1. Display LIVE/OFFLINE/SYNCING/LIVE state from device/backend evidence.
2. After Wi-Fi down 30 seconds, device starts its own SmartClass-<TeamID> AP with same password. Website shows reported AP state, local-page address and pending queue count.
3. Show BLE name using Level 12 convention: SC-<TeamID>-<STATE>; examples SC-T07-OFFLINE and SC-T07-FIRE. Do not use an unrelated naming convention.
4. Offline entry record is clearly flagged `face not verified`; only hardware-admitted class UIDs should appear as accepted.
5. Display pending record count, oldest pending time, sync start/progress/completion, rejected/duplicate count, last sync and error detail.
6. Preserve original event times; show server receipt time separately.
7. Device persists >=30 minutes of telemetry/event records through power loss; website can verify the subsequent oldest-first upload and exactly-once persistence through source sequence and database constraints.
8. Show recovery timeline across device boot, connection, AP, BLE, queue replay and final sync.

Judge & Evidence Centre:
- Levels 1–12 with name, marks and group.
- Requirement checklist per level based on Part B.
- Each test requirement has pending/pass/fail/not-applicable state, evidence link, measured value, threshold, timestamp, tester and notes.
- Capture live measurements where possible: API response, device-to-server arrival, notification delivery, setting propagation, OTA duration, camera FPS, occupancy delay, hand-raise delay, CSI rate/presence/localization delay, offline queue sync and recovery.
- Built-in stopwatch for video recordings.
- Store Git tag and commit hash per level. The competition materials show both `L-NN` and `level-NN` patterns; support both tags pointing to the same tested commit until organizer confirmation.
- Evidence files naming: `<TeamID>_L<NN>_video.mp4` and `<TeamID>_L<NN>_writeup.pdf` where the submission process requires them.
- Generate write-up outline with five required headings: (1) Design + diagram, (2) Where it shows + screenshots, (3) Test results with every pass item, measured value and limit, (4) Problems and fixes, (5) Extra item.
- Evidence completeness must be checked before marking a level complete.
- Track live judging attempt 1 / attempt 2; do not award final completion merely because checklist toggled. A level is complete only after pass + evidence upload, following competition rules.
- Screenshot capture must be deliberate and not store private biometric data beyond policy.
- Allow export of level result/evidence manifest.

Create a competition readiness dashboard that surfaces missing evidence and unverified hardware checks. This centre must clearly distinguish software test/simulator results from actual judge-observed hardware results.
```

## PROMPT 13 — Full Integration, Security, Performance and Acceptance Testing

```text
Act as the QA Lead and Application Security Engineer. Test the complete SmartClass platform against all individual Level 1–12 requirements in Part B. Do not mark hardware-dependent tests passed unless they use actual device output or a signed/recorded judge result.

Build an acceptance test matrix with:
- requirement ID;
- level;
- actor/role;
- preconditions;
- action;
- expected device effect (hardware teammate-owned);
- expected backend record;
- expected dashboard/local-page display;
- time limit;
- evidence required;
- test result and notes.

Test suites:
1. Unit tests for business logic: thresholds/hysteresis, attendance windows, card blocking, access policies, CSV calculations, report calculations, notification routing, config validation and state transitions.
2. API integration: token validation, schema validation, sequence dedupe, offline batch sync, config delivery, command ack, face verification adapter, CSI ingestion and OTA tracking.
3. RLS/security: cross-room access, Guardian child isolation, Student isolation, Teacher restriction, Admin-only settings/OTA, snapshot denial, biometric data protection and audit trails.
4. Concurrency: two teachers Ack same alert; duplicate card tap; simultaneous attendance check-in; two config changes; retry storm; repeated device sequence.
5. Realtime: reconnect/reconcile after network loss, duplicate subscription protection, role-scoped updates, fire/panic banners.
6. Offline: out-of-order delayed records, original timestamps, duplicate replay and power recovery after device reconnect.
7. Privacy: enrollment image deletion, temporary face crop deletion, private snapshot signed URL expiry, student deletion cascade/reconciliation, no counting/live frame retention.
8. AI metric integrity: cannot mark model evaluated without held-out set; held-out split >=20%; no fabricated accuracy; CSI excludes camera input.
9. Performance: query pagination, indexes, chart query range, device ingest load, realtime subscription scope, large event history, media streaming outside serverless limits.
10. UX: responsive layout, language switching on all pages, keyboard accessibility, loading/error/empty/offline/stale states.

Verify level-specific times:
- L1 status every second; watchdog evidence under 10 seconds (device test).
- L2 telemetry 5 ± 1 seconds; offline within 30 seconds; setup return within 15 seconds (device test).
- L3 Fire cloud event within 3 seconds, FIRE/PANIC banner within 3 seconds.
- L4 room dashboard within 3 seconds of new data; live judged dashboard within 5 seconds; phone alert within 10 seconds; lockout 5 wrong attempts/30 seconds.
- L5 settings reaches device within 10 seconds; OTA workflow tracks under 3 minutes; rollback trigger after 60 seconds unable to reach server (device test).
- L6 weather fetched every 15 minutes; Danger dashboard/device within 10 seconds.
- L7 no-face local denial within 3 seconds; door grant under 5 seconds; Guardian Late/Absent notification within 60 seconds.
- L8 mismatch alert within 10 seconds; block after 3 mismatches in 2 minutes for 5 minutes; Ack once.
- L9 occupancy sample every 2 seconds, stable 3 seconds, update within 6 seconds; live view >=2 FPS; capacity held 3 seconds; intruder alert/snapshot within 10 seconds; covered/moved and recovery within 6 seconds; camera-fault Teacher alert within 10 seconds.
- L10 hand held 2 seconds, Teacher update within 5 seconds, once per raise; dataset minimums and held-out metrics.
- L11 CSI >=20 packets/sec; presence state hold 3 seconds; EMPTY/OCCUPIED within 5 seconds; map within 3 seconds; held-out CSI >=20%.
- L12 AP start after 30 seconds Wi-Fi outage; >=30 minutes of telemetry buffer; oldest-first exactly-once recovery; original timestamps; BLE status.

Produce:
- test reports;
- Playwright tests for critical user journeys;
- API and database integration tests;
- security test matrix;
- known limitations;
- hardware test checklist for teammate;
- deployment smoke test.

Do not change acceptance thresholds to make tests pass. Report any unmet condition clearly.
```

## PROMPT 14 — Production Deployment, Monitoring and Final Documentation

```text
Act as a DevOps/SRE Lead. Prepare the SmartClass website/backend for stable public HTTPS deployment and competition use.

Requirements:
1. Deploy Next.js application to Vercel and Supabase services to the appropriate project.
2. Separate development, staging and production environments.
3. Add `.env.example` with names only and safe descriptions; never include actual secrets.
4. Validate required environment variables at startup/build and fail clearly if missing.
5. Keep Supabase service-role key, weather key, notification keys, device credential verifiers and inference service secrets on server/worker only.
6. Add database migration deployment procedure and rollback/back-up notes.
7. Add private Storage bucket setup and access-policy verification.
8. Configure HTTPS, allowed origins, security headers, request size limits, rate limits and device endpoint abuse protection.
9. Add health endpoints for website/backend/dependencies; do not expose secrets or private system information.
10. Add structured logs with request ID, device ID and event ID, while redacting tokens, face crops and sensitive personal data.
11. Add error reporting and monitoring for API failures, ingestion lag, Realtime disconnects, notification failures, weather staleness, OTA job failures and offline queue growth.
12. Document backups, restore test, data deletion, private snapshot retention, token rotation and incident response.
13. Add README instructions for local development, migrations, seed/test data, test commands, deployment, device contract and actual hardware integration.
14. Add post-deployment smoke tests for login, role permissions, device ingest, Realtime, private storage, notifications and CSV exports.
15. Confirm the public site runs only on HTTPS. The local ESP32 page remains on its device/local network address.
16. Confirm no real token/secret is in Git history; if exposed, rotate it rather than merely deleting the visible file.

Provide a final deployment checklist and distinguish verified cloud functionality from hardware functionality awaiting the teammate's board.
```

---

# PART F — RECOMMENDED BUILD ORDER AND MILESTONES

Do not build in a purely visual order. Build foundations that unblock both the site and hardware integration.

| Milestone | Prompts | Deliverable | Hardware dependency |
|---|---|---|---|
| M0 — Architecture | 00 | Architecture, requirement matrix, open questions | None |
| M1 — Contract | 01 | Stable API contract, schemas, mock device | Teammate reviews contract |
| M2 — Database | 02 | Migrations, RLS, storage, constraints | Confirm device identity/event fields |
| M3 — Auth | 03 | Four roles, secure access, onboarding | None |
| M4 — Device backend | 04 | Ingestion, realtime, config and commands | Real payload confirmation |
| M5 — UI foundation | 05 | Design system and role-aware app shell | None |
| M6 — Dashboard | 06 | Command Centre and room operations | Telemetry/event integration |
| M7 — Access | 07 | Attendance, cards, Guardian and Student | Card/face event integration |
| M8 — Safety/OTA | 08 | Incident Centre, settings, notifications, OTA UI | Device command/ack/OTA events |
| M9 — Data/AI | 09 | Weather, history, reports, assistant | Telemetry/event history |
| M10 — Vision | 10 | Camera, occupancy and hand-raise interfaces | Camera/model event contract |
| M11 — CSI | 11 | CSI Model Lab and 2×2 map | CSI payload/model result |
| M12 — Resilience/evidence | 12 | Offline recovery and Judge Centre | Offline/BLE/power test records |
| M13 — QA | 13 | Acceptance and security report | Real hardware test session |
| M14 — Release | 14 | Production deployment and README | Final integration verification |

## Work that can proceed in parallel

**You (website/backend):** Prompts 00–09 can be developed using the contract and mock device. Continue Prompts 10–12 with mock inference providers and clearly labelled synthetic fixtures.

**Hardware teammate:** firmware, sensors, local status page, serial commands, camera/CSI/BLE/OTA/offline features. They should implement against the agreed API contract and send real JSON fixture captures as early as possible.

**Integration checkpoints:**

1. After Prompt 01: agree exact API, field names, sequence, credentials and transport.
2. After Prompt 04: teammate successfully posts one telemetry message and one event to the deployed development API.
3. After Prompt 06: live values appear on your dashboard from the real board.
4. After Prompts 07–08: card/face decision, safety events and commands are end-to-end tested.
5. After Prompts 10–11: camera, hand-raise and CSI real outputs populate their pages.
6. Before final: offline/power-cut recovery and OTA are tested with the actual device.

---

# PART G — WHAT THE HARDWARE TEAMMATE MUST GIVE YOU

Ask your teammate to supply these artifacts as soon as possible. This is not a request for them to build the website; it is the minimum interface contract required for your work.

1. `device-contract.json` or equivalent exact telemetry/event examples.
2. Device ID and Team ID format.
3. Actual endpoint method/path they will call, or approval of the proposed routes.
4. Authentication header and token storage approach.
5. One real telemetry JSON sample.
6. One real sample per event type as implemented.
7. Persistent sequence behaviour, including whether telemetry and events share one sequence.
8. Source timestamp and NTP behaviour.
9. Config fetch/poll interval and device acknowledgement payload.
10. Command acknowledgement and failure format.
11. Face crop format, dimensions, content type and request timeout.
12. Camera stream mechanism and actual FPS.
13. Camera analysis event format: occupancy, boxes, moved/covered score, camera fault and intruder.
14. Hand-raise event payload: seat, event time, model version, prediction latency.
15. CSI packet/feature payload, rate, subcarrier/channel metadata, zone labels and prediction result.
16. Offline sync batch payload, oldest-first behaviour and partial response handling.
17. BLE name format and state transitions.
18. OTA URL download, checksum verification, status event and rollback reporting.
19. Local page mDNS/IP address format and status fields.
20. Hardware limitations or features not supported by the exact ESP32-S3-CAM board variant.

Do not guess missing fields. Put the unanswered item in `/docs/hardware-contract-open-questions.md` and keep the UI in an explicit “Waiting for device integration” state until confirmed.

---

# PART H — NON-NEGOTIABLE DEMONSTRATION CHECKLIST

Before declaring the website/backend ready, confirm:

- [ ] The real ESP32 can authenticate and send telemetry.
- [ ] Level 2 telemetry arrives at 5 ± 1 seconds.
- [ ] Server rejects duplicate `(device_id, seq)` messages.
- [ ] Original event time survives offline sync; server receipt time is separate.
- [ ] Dashboard updates from actual Realtime/device data.
- [ ] Device is marked offline within 30 seconds of silence.
- [ ] Four roles work and have been tested by manually calling APIs, not just by hiding UI links.
- [ ] Guardian sees linked child only.
- [ ] Student sees own attendance only.
- [ ] Teacher sees assigned rooms only.
- [ ] Admin-only settings and OTA cannot be accessed by Teacher.
- [ ] FIRE/PANIC banners and Teacher phone alerts are measured against level limits.
- [ ] Level 5 threshold reaches device within 10 seconds and the device confirms applied revision.
- [ ] Weather data refreshes every 15 minutes; stale data is visibly labelled.
- [ ] Daily report, event filtering and CSV exports match database records.
- [ ] AI assistant returns no-data when source records do not exist.
- [ ] Enrollment photographs and verification crops are deleted after processing.
- [ ] Private snapshots are not accessible to Student/Guardian.
- [ ] Concurrent Ack creates exactly one acknowledgement.
- [ ] Student deletion removes biometric/card/snapshot data and records audit.
- [ ] Camera stream is >=2 FPS for Level 9, and frames are not retained.
- [ ] Occupancy, camera health, hand raise and CSI pages display actual measured outputs.
- [ ] CSI decision path cannot use camera data.
- [ ] Offline status, queue count, sync and BLE name are shown from actual device reports.
- [ ] Evidence centre distinguishes mock/simulator tests from real hardware tests.
- [ ] Every completed level has its evidence manifest, code reference and correct submission file names.
- [ ] README and environment documentation are current.

---

# FINAL INSTRUCTION TO THE CODING AGENT

Build this as a coherent full-stack product, not a collection of disconnected demo pages. The user interface, API, database, device contract, model integrations, notifications, audit records and evidence centre must agree on the same data model and state transitions.

The individual Level 1–12 requirements in Part B are the acceptance authority wherever they conflict with a shared/generalized specification. Keep the hardware teammate's firmware as an external client of the versioned API. Do not implement fake hardware behaviour in the website. Use the mock device only to unblock development, and visibly identify mock data. Never mark real hardware requirements passed until actual device data and test evidence are recorded.

Work one prompt at a time, run checks after each milestone, preserve the API contract, and maintain the traceability matrix throughout the project.
