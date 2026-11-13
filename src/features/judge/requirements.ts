// Per-level requirement checklist, from Part B of the master prompts and the paper's "Judged live" /
// "Video must show" lists. `hardware` = needs the real board: such a requirement can only be marked
// PASS from REAL_DEVICE evidence (a DB CHECK enforces it), never from a simulator or software test.
export interface Req { code: string; text: string; hardware: boolean; limit?: number; unit?: string }

const hw = (code: string, text: string, limit?: number, unit?: string): Req => ({ code, text, hardware: true, limit, unit });
const sw = (code: string, text: string, limit?: number, unit?: string): Req => ({ code, text, hardware: false, limit, unit });

export const LEVEL_REQUIREMENTS: Record<number, Req[]> = {
  1: [hw("L1-LED-2HZ", "Steady 2 Hz heartbeat in the state colour"), hw("L1-STATUS-1S", "[STATUS] line every second, exact format", 1, "s"), hw("L1-CARD-ONCE", "One [CARD] line per physical tap"),
      hw("L1-HEALTH-TASKS", "health and tasks commands show both cores"), hw("L1-WATCHDOG", "Watchdog restart", 10, "s"), hw("L1-RFID-ERR", "RFID sensor error detected", 3, "s"),
      hw("L1-DHT-ERR", "DHT11 sensor error detected", 12, "s"), hw("L1-BOOT-FLAME", "Flame at start-up gives door UNLOCKED")],
  2: [hw("L2-AP-SETUP", "Setup AP SmartClass-<TeamID> at 192.168.4.1"), hw("L2-LOCAL-PAGE", "Local page at IP and smartclass-<teamid>.local"), hw("L2-TELEMETRY-5S", "Telemetry interval 5 ± 1 s", 6, "s"),
      sw("L2-REPLAY", "Replay of (device_id, seq) rejected"), hw("L2-OFFLINE-30S", "Platform marks device offline", 30, "s"), hw("L2-RECONNECT", "Reconnects without restarting"),
      hw("L2-TLS", "HTTPS/TLS with certificate checked"), sw("L2-NO-SECRETS", "No secret in the repository")],
  3: [hw("L3-WARNING", "Warning at >=32 °C or >=85 %RH"), hw("L3-DANGER", "Danger at >=40 °C"), hw("L3-HYSTERESIS", "Leave 2 °C below the limit"), hw("L3-HOLD", "New status holds 3 s", 3, "s"),
      hw("L3-FIRE-3S", "FIRE reaches the cloud", 3, "s"), hw("L3-FIRE-LATCH", "Door still UNLOCKED after power cut"), hw("L3-TEACHER-SILENCE", "Only the Teacher tag silences, after the flame is gone"),
      hw("L3-PANIC", "2 s touch raises PANIC within 3 s", 3, "s"), hw("L3-BAD-QUALITY", "Failed reading keeps status, quality bad"), hw("L3-TREND", "Trend never operates light, buzzer or door")],
  4: [sw("L4-ROLES", "Four roles enforced by the server"), hw("L4-DASH-3S", "Dashboard updates", 3, "s"), hw("L4-BANNER-3S", "FIRE/PANIC banner on every dashboard", 3, "s"),
      hw("L4-PHONE-10S", "Phone alert delivered", 10, "s"), sw("L4-BANGLA", "Bangla on two pages"), sw("L4-LOCKOUT", "5 wrong passwords lock 30 s"),
      hw("L4-HEALTH", "Device health panel matches the health command"), sw("L4-ACCOUNTS", "Judge accounts created")],
  5: [hw("L5-SETTINGS-10S", "Saved limit reaches the device", 10, "s"), hw("L5-PERSIST", "Limit survives restart"), sw("L5-VALIDATION", "Invalid limits refused with a clear message"),
      sw("L5-ADMIN-ONLY", "Teacher cannot open settings"), hw("L5-OTA-3MIN", "Firmware update with settings kept", 180, "s"), hw("L5-DAMAGED", "Damaged image rejected"),
      hw("L5-ROLLBACK", "Faulty image rolls back within 60 s", 60, "s"), sw("L5-CHANGE-LOG", "Change log shows who/what/when")],
  6: [sw("L6-WEATHER-15", "Weather fetched every 15 minutes", 15, "min"), sw("L6-NOTICES", "Notice board with severity and source"), hw("L6-DANGER-10S", "Danger notice on dashboards and device", 10, "s"),
      sw("L6-STALE", "Last data with age and Data stale"), sw("L6-CHART", "Chart for up to 24 h"), sw("L6-HISTORY", "Event history filters"), sw("L6-REPORT", "Daily report"),
      sw("L6-CSV", "CSV matches the page"), sw("L6-ASSISTANT", "Assistant matches the report; no data answered as no data"), sw("L6-ACCESS", "Students/Guardians cannot open history, report or assistant")],
  7: [hw("L7-NOFACE", "NO FACE denied by the device", 4, "s"), hw("L7-UNLOCK", "Card tap to unlock", 5, "s"), sw("L7-ONE-RECORD", "One attendance record per student per class"),
      sw("L7-WINDOWS", "Present <=10 min, Late after, Absent after 30 min"), hw("L7-DENIALS", "Denial reasons shown"), sw("L7-GUARDIAN-60S", "Guardian notified", 60, "s"),
      hw("L7-CROP-ONLY", "Only the face crop leaves the device"), sw("L7-NO-PHOTOS", "Enrolment photos and crops are not kept")],
  8: [hw("L8-MISMATCH", "Face mismatch denied; no card-only fallback"), hw("L8-ALERT-10S", "Teacher alerted", 10, "s"), hw("L8-SPOOF", "Phone-screen photo never unlocks"),
      sw("L8-LOCKOUT", "3 mismatches in 2 min block 5 min"), sw("L8-ACK-ONCE", "Concurrent Ack records exactly one"), sw("L8-DELETE", "Delete student removes all biometric data + audit"),
      sw("L8-SNAPSHOT-PRIVATE", "Student cannot open a snapshot URL")],
  9: [hw("L9-POSITIONS", "DOOR and ROOM positions with references"), hw("L9-DOOR-ONLY", "Check-in only at DOOR"), hw("L9-COUNT", "Count and seat map update", 6, "s"),
      hw("L9-LIVE-2FPS", "Live view", 2, "fps"), hw("L9-CAPACITY", "OVER CAPACITY after 3 s"), hw("L9-INTRUDER", "INTRUDER alert with one snapshot", 10, "s"),
      hw("L9-TAMPER", "COVERED / MOVED detected", 6, "s"), hw("L9-RECOVER", "Back to OK", 6, "s"), hw("L9-NO-FALSE-FAULT", "People walking cause no fault"), sw("L9-NO-FRAMES", "Counting/live frames are not stored")],
  10: [hw("L10-DATASET", "At least 100 images per class"), sw("L10-HELD-OUT", "At least 20% held out, never trained"), sw("L10-OWN-MODEL", "Own-trained classifier, code in repo"),
       sw("L10-MODEL-PAGE", "Model page shows counts, accuracy, matrix, latency"), hw("L10-RAISE-5S", "HAND RAISED on the right seat", 5, "s"), hw("L10-ONCE", "Once per raise"), hw("L10-TRIALS", "At least 3 of 4 live trials correct")],
  11: [hw("L11-CSI-RATE", "CSI packets per second", 20, "pkt/s"), hw("L11-COVERED", "Camera covered and unused"), hw("L11-PRESENCE", "EMPTY/OCCUPIED", 5, "s"), hw("L11-ZONES", "At least 3 of 4 zones correct"),
       hw("L11-MAP", "Map updates", 3, "s"), sw("L11-HELD-OUT", "At least 20% held out"), sw("L11-MODEL-PAGE", "Model page shows samples, accuracy, matrix, delay")],
  12: [hw("L12-STATES", "LIVE, OFFLINE, SYNCING, LIVE shown"), hw("L12-OFFLINE-ENTRY", "Card-only entry for cached cards, flagged face-not-verified"), hw("L12-AP-30S", "Own AP after 30 s down", 30, "s"),
       hw("L12-BLE", "BLE name SC-<TeamID>-<STATE>"), hw("L12-BUFFER", "At least 30 minutes buffered", 30, "min"), hw("L12-ONCE-ORIGINAL", "Sent once, oldest first, original times"),
       hw("L12-POWER-CUT", "10 s power-off keeps the pending count"), hw("L12-TWO-RESTARTS", "State agrees after two restarts", 20, "s")],
};

export const requirementFor = (level: number, code: string): Req | undefined => LEVEL_REQUIREMENTS[level]?.find((r) => r.code === code);
