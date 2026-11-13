# SmartClass — Requirements Traceability Matrix (Draft v0.1)

**Scope:** website/backend acceptance requirements for Levels 1–12 (Part B). Each row maps a requirement to the page/API/table/service that satisfies it, the hardware dependency, and the verification test.
**Precedence:** individual Level text wins over shared/generalized text.
**Date:** 2026-11-13. Columns: **R** = requirement · **Satisfied by** (page / API / table / service) · **HW dep** = hardware dependency · **Verify** = verification test.

---

## Level 1 — Dual-Core Tasks, Health, Watchdog (35)

| R | Satisfied by | HW dep | Verify |
|---|---|---|---|
| Health view (chip temp, heap, PSRAM, flash, CPU freq, RSSI, uptime, reset reason, fw) | `/devices/[id]` · `DeviceHealthPanel` · `POST /health` · `device_health_snapshots` | device `health` cmd | mock health payload renders all fields |
| Task/core view (name, core, free stack) | `/devices/[id]` · `DeviceHealthPanel` · `device_health_snapshots.tasks` | device `tasks` cmd | both cores inspectable from payload |
| 1 status sample/sec + structured logs | `telemetry_readings` · `device_events` · `EventTable` | device status stream | 1 Hz samples shown when sent |
| `[CARD]` tap once per physical tap | `device_events` idempotency `(device_id,seq)` | one event per tap | replayed tap → not duplicated |
| Sensor failure + recovery display | `device_events` (`SENSOR_ERROR`) · `SafetyStateBanner` | DHT11 ≤12 s, RFID ≤3 s detect | 15 s wire-disconnect test shows+clears error |
| Boot reasons `POWER_ON/SOFTWARE/WATCHDOG/CRASH/BROWNOUT` | `device_events` (`BOOT`) · health panel | device reports reason | each value renders distinctly |
| Watchdog reset evidence + measured restart interval | `device_events` · `Stopwatch` | real WDT reset | interval measured, not inferred from heartbeat |
| Boot flame check (no flame→LOCKED, flame→UNLOCKED) | telemetry `door` · `SafetyStateBanner` | device boot state | startup door state shown |

## Level 2 — Wi-Fi Setup & Secure Telemetry (45)

| R | Satisfied by | HW dep | Verify |
|---|---|---|---|
| Device provisioning record + token mgmt | `/devices/[id]` · `devices`,`device_credentials` · onboarding service | device accepts token | token revealed once, hash stored |
| Local page link (mDNS `smartclass-<teamid>.local` / IP) | `/devices/[id]` labelled link | device reports mDNS/IP | link shown, labelled as device-hosted |
| Telemetry 5±1 s + charts + connection state | `POST /telemetry` · `TelemetryChart`,`ConnectionPill` | device send interval | samples arrive ~5 s; chart updates |
| HTTPS + cert check + per-device auth | device-token middleware | device validates TLS | bad token rejected 401 |
| Persistent strictly-increasing seq; replay rejected | `(device_id,seq)` unique · replay log | device persistent seq | replay returns duplicate |
| Offline within 30 s silence, online on return | heartbeat monitor service · `ConnectionPill` | heartbeat cadence | silence 30 s → offline badge |
| Fixed data format preserved at boundary | Zod telemetry schema · one adapter | agreed field names | fixture validates exactly |

## Level 3 — Heat, Fire, Panic, Fail-Safe Door (50)

| R | Satisfied by | HW dep | Verify |
|---|---|---|---|
| SAFE/WARNING/DANGER + FIRE/PANIC states | `safety` service · `security_incidents` · `SafetyStateBanner` | device sends states/events | thresholds render correct state |
| Thresholds: warn ≥32 °C or ≥85% RH; danger ≥40 °C; 2 °C hysteresis; 3 s hold | safety state machine | device evaluates locally | boundary values produce correct transitions |
| Heat index + formula/version + trend (last 10) | telemetry fields · `TelemetryChart` | device computes HI | HI + trend shown; trend never actuates |
| Invalid readings `quality=bad` keep last status | adapter quality gate | device flags quality | out-of-range reading ignored |
| FIRE latched, UNLOCKED through power loss; only Teacher/Admin reset after flame gone | `Reset fire` command (role+safety gated) | device latches/clears | cloud cannot clear active flame |
| Panic: ≥2 s touch → PANIC, cloud ≤3 s | `device_events` (`PANIC`) · banner | device debounce | banner ≤3 s |
| Fire/panic banner on every dashboard ≤3 s | Realtime publication · `SafetyStateBanner` | event timestamp | all logged-in dashboards show ≤3 s |
| Door shown simulated LOCKED/UNLOCKED | telemetry `door` · labelled | device door state | clearly labelled simulated |

## Level 4 — Secure Platform, Roles, Alerts (40)

| R | Satisfied by | HW dep | Verify |
|---|---|---|---|
| 4 server-enforced roles (Admin/Teacher/Student/Guardian) | authz helpers · RLS · `user_profiles`,`user_roles` | — | role tests pass at API+DB |
| Public HTTPS login, hashed passwords | `/login` · Supabase Auth | — | no plaintext; TLS only |
| Live room dashboard ≤3 s | Realtime · `/rooms/[id]` | device telemetry | new data visible ≤3 s |
| `Reset fire` only Teacher/Admin + safety-gated | command allowlist | device safety | Student cannot invoke |
| Phone alert FIRE/PANIC/Heat-Danger ≤10 s | `notifications`,`notification_deliveries` · channel adapter | event time | provider result+time recorded ≤10 s |
| English/Bangla on ≥2 pages | `i18n/` keys | — | labels switch correctly |
| Lockout: 5 wrong → reject 30 s; Admin sees attempts | `login_attempts` · lock policy · `/settings/audit` | — | correct pw rejected during lock |
| Judge accounts (Admin/Teacher/S1/S2/Guardian→S1) | dev seed script | — | seeded, no hardcoded creds in source |

## Level 5 — Remote Settings, OTA, Rollback (30)

| R | Satisfied by | HW dep | Verify |
|---|---|---|---|
| Admin settings: warn (32) / danger (40), range 0–50, warn<danger | `/devices/[id]/configuration` · `device_configurations` | device applies | validation rejects warn≥danger |
| Apply ≤10 s, persist, `SETTINGS_APPLIED` | command state machine · config revision | device applies+acks | revision bump + event ≤10 s |
| Change log who/what/old/new/time | `device_config_history` · `audit_logs` | — | every change logged |
| Teacher cannot access settings | RLS + authz | — | Teacher 403 |
| Firmware upload, private storage, signed URL | `/devices/[id]/ota` · `ota_releases` · private bucket | — | no public URL |
| OTA page (version/size/hash/date/uploader/target/state/progress/result) | `OtaReleaseCard` · `ota_jobs` | device OTA | fields populated from job |
| `OTA_DONE/OTA_REJECTED/OTA_ROLLBACK` events; auto-rollback if no server contact ≤60 s | `device_events` · ota job tracking | device does rollback | events recorded; platform tracks only |

## Level 6 — Weather, History, AI Assistant (40)

| R | Satisfied by | HW dep | Verify |
|---|---|---|---|
| Weather fetch every **15 min** (individual), current + 24 h forecast | weather service (server key) · `weather_cache` · `/weather` | — | cache timestamped; 15-min cadence |
| Notice board (storm/cyclone/flood/heatwave) severity+source+window; derived labelled | `weather_notices` · `WeatherNoticeCard` | — | official vs derived labelled |
| Admin add/remove TEST notice | `/weather` admin control | — | test notice toggles |
| Danger notice: red banner ≤10 s + device command ≤10 s | Realtime · command to device | device shows local | banner+command ≤10 s |
| Weather failure: keep last + `Data stale` + age | `DataFreshnessLabel` | — | never blank-as-current |
| Stored telemetry chart ≤24 h; event filter by type/time | `/rooms/[id]/history` · `TelemetryChart`,`EventTable` | — | filter works |
| Daily report (min/max/avg T&RH, alarm counts, attendance totals) + CSV | `/reports/daily` · `daily_reports` · `CsvExportControl` | — | report matches data |
| Teacher-only AI assistant (en/bn), grounded, "no data" exact | `/assistant` · grounded over stored data | — | assistant == daily report; no guessing |
| Students/Guardians blocked from history/report/assistant | RLS + authz | — | 403 |

## Level 7 — Card & Face Check-In (50)

| R | Satisfied by | HW dep | Verify |
|---|---|---|---|
| Enrol after consent; ≥3 face images → embeddings; delete originals | `/students/[id]` · `consent_records`,`face_embeddings` | — | no enrollment photos retained |
| Register card via device `CARD_TAP` → link UID; change/remove | `/access/cards` · `student_cards` | device tap | mapping created/edited |
| On tap: device sends cropped face+UID; NO FACE local ≤3 s | `POST /face/verify` | device face detect | no-face denied without backend |
| Backend matches face vs card owner + class-in-room | face match service · `class_sessions` | model result | correct owner+class verified |
| Success → simulated unlock 5 s; tap→unlock <5 s | command/ack · `Stopwatch` | device door | timed <5 s |
| One attendance/student/class; repeat opens door no 2nd row | `(class_session_id,student_id)` unique | — | repeat tap no duplicate |
| Windows: Present ≤10 min, Late after, Absent ≤30 min no-show | attendance service | — | windows correct |
| Denial reasons NO FACE/NOT IN THIS CLASS/NO CLASS NOW/UNKNOWN CARD | `device_events` (`ENTRY_DENIED`) | device/backend | each reason shown |
| Guardian notified Late/Absent ≤60 s | `notifications` | — | linked guardian ≤60 s |
| Face crops not retained; embeddings/links/attendance stored | retention policy | — | no crop in storage |

## Level 8 — Spoofing, Lockout, Data Deletion (30)

| R | Satisfied by | HW dep | Verify |
|---|---|---|---|
| Face≠card owner → FACE MISMATCH, no card-only fallback online | face match service · `security_incidents` | model | never admits on mismatch |
| Private mismatch snapshot, Teacher/Admin+room only; alert ≤10 s | private bucket · signed URL · `notifications` | device snapshot | Student cannot open URL |
| Phone-screen spoof blocked via model spoof result | integrate spoof result | model spoof flag | not passed without evidence |
| 3 mismatches/same card/2 min → block 5 min (incl owner); Admin unblock | `blocked_cards` · block service | — | block+expiry+manual unblock audited |
| Atomic ack (exactly one succeeds) | `incident_acknowledgements` unique | — | concurrent ack: one wins |
| Delete student: remove embeddings/card/snapshots/biometrics + `STUDENT_DELETED` audit, retry on partial fail | deletion SQL fn + storage orchestration · `audit_logs` | — | all artifacts gone; audit kept |
| Student cannot open private snapshot URL | RLS + signed-URL scope | — | 403 even with URL |

## Level 9 — Occupancy, Live View, Night Watch, Tamper (50)

| R | Satisfied by | HW dep | Verify |
|---|---|---|---|
| Two camera positions DOOR/ROOM + reference snapshots | `camera_positions` · `/rooms/[id]/vision` | operator re-aims | positions saved |
| Check-in only at DOOR; ROOM → CAMERA NOT AT DOOR | position gate in face verify | selected position | denial correct |
| ≥2 seat zones on ROOM; normalized coords | `SeatMapEditor` · `seat_zones` | — | scales with display |
| Person count every 2 s; zone occupied; 3 s hold, ≤6 s appear | occupancy service · `occupancy_events` | person detector | state within 6 s |
| Live view ≥2 FPS with boxes; Teacher/Admin only | `CameraViewport` · stream/worker | device/stream | Student/Guardian blocked |
| Capacity set; >cap 3 s → OVER CAPACITY event | `rooms.capacity` · `occupancy_events` | — | event recorded |
| Night mode: person 3 s → INTRUDER; alert+1 snapshot ≤10 s | night service · private snapshot | device/detector | one snapshot kept |
| Camera tamper COVERED/MOVED ≤6 s, recover OK ≤6 s; live scores | `camera_health_events` | reference compare | walkthrough no false fault |
| Camera fault → alert ≤10 s, check-in denied CAMERA FAULT | fault gate | device fault | denial correct |
| Store only intruder + required fault evidence | retention policy | — | counting frames not stored |

## Level 10 — Own-Trained Hand-Raise Detector (40)

| R | Satisfied by | HW dep | Verify |
|---|---|---|---|
| ≥100 raised + ≥100 non-raised, ≥20% held out; team-trained; training code in repo | dataset summary · training code | camera at ROOM | counts real, held-out never trained |
| Model page: counts/class, train/val/test split, held-out acc, confusion matrix, latency | `/models/hand-raise` · `ModelMetricPanel`,`ConfusionMatrix` · `model_runs`,`model_metrics` | — | metrics from real eval |
| Hand ≥2 s in seat zone → HAND RAISED–Seat n ≤5 s, once/raise | `handraise_events` | model inference | one event/raise ≤5 s |
| Today's raises per seat | dashboard tile · `handraise_events` | — | per-seat counts |
| Never fabricate metrics; `not evaluated` until real | guard in UI | — | placeholder until eval exists |

## Level 11 — Wi-Fi CSI Presence & Localization (40)

| R | Satisfied by | HW dep | Verify |
|---|---|---|---|
| CSI ≥20 pkt/s captured; camera covered, unused | `POST /csi/batch` · `csi_samples` | device CSI capture | camera excluded from inputs |
| Presence EMPTY/OCCUPIED, change after 3 s stable, `PRESENCE` event | csi service · `presence_events` | — | 3 s stability enforced |
| 2×2 localization, labelled samples per zone+empty, ≥20% held out | dataset · `model_runs` | fixed positions | samples per zone shown |
| Model page: samples, model/features, held-out acc, confusion matrix, presence delay | `/models/wifi-csi` · `ModelMetricPanel`,`CsiZoneMap` | — | metrics real |
| Live 2×2 map highlights predicted zone ≤3 s | `CsiZoneMap` · `csi_predictions` | model | map updates ≤3 s |
| No camera/vision data in CSI inputs | input isolation | — | enforced separation |

## Level 12 — Offline, Bluetooth, Power-Cut Recovery (50)

| R | Satisfied by | HW dep | Verify |
|---|---|---|---|
| Connection state LIVE/OFFLINE/SYNCING + offline heartbeat report | `ConnectionPill` · sync service | device LED/heartbeat | states transition correctly |
| Offline card-only admission for cached UIDs → `OFFLINE_ENTRY` "face not verified" | `device_events` · flag in UI | device cache | flagged in dashboard |
| Device AP after 30 s down; show AP availability + pending count | device status display | device AP | count shown when reported |
| BLE name `SC-<TeamID>-<STATE>` displayed verbatim | device status · BLE field | device BLE | exact name shown |
| Persist ≥30 min offline, survive power cut, oldest-first, each once, original `ts` | `POST /sync` per-record result · `(device_id,seq)` | device queue | 10 s power-off: no count loss, records once |
| Restore door/fire/settings/Room ID/Teacher tags after restart | state reconciliation | device NVS | 2 restarts → agreement ≤20 s |
| Queue length, oldest pending ts, progress, failed/retried, last sync, recovery timeline | `IncidentTimeline`/sync view | — | timeline shows disagreement, not masked |
| Accept + preserve original source ts; `received_at` separate | adapter + schema | — | original ts preserved |

---

## Hardware-dependency summary

Every "HW dep" above that the firmware teammate must supply is consolidated in [`hardware-contract-open-questions.md`](./hardware-contract-open-questions.md). The mock device simulator (Prompt 01) stands in for all of them during development but is **not** evidence that the physical board passed a level.
