# FastRobox 1.0 Techathon Grand Finale — Master System Blueprint & Prompt Engineering Suite

**Competition:** FastRobox 1.0 Techathon Grand Finale (BUBT)  
**Project Theme:** AI-Powered Smart Classroom: Safety, Access, and Vision  
**Target Hardware:** Single `ESP32-S3-CAM` (with onboard RGB LED & BOOT button) + 5 Peripheral Modules (No Breadboard Allowed)  
**Target Cloud Stack:** Next.js 15 (App Router, TypeScript, Tailwind CSS) + Supabase (PostgreSQL, Realtime, Storage) hosted on Vercel (`HTTPS`)  

---

## 1. Competition-Specific Architecture & Rule Compliance Matrix

Before running the build prompts below, ensure every architectural decision adheres to the non-negotiable constraints from the official rulebook:

| Rulebook Requirement | Architectural Implementation |
| :--- | :--- |
| **No Hard-Coding (Rule 3)** | `Wi-Fi SSID`, `Wi-Fi Password`, `Room ID`, and `Class Start Time` are NEVER hardcoded in firmware or frontend code. They are injected on the spot via the ESP32 Local Status Page (`Preferences.h` NVS flash) and synced with the `classroom_config` table in Supabase. |
| **No Secrets in Code (Rule 3)** | Zero API keys, passwords, or tokens in Git commits. Next.js uses `.env.local` (ignored by Git). ESP32-S3 receives its API endpoint and Supabase Anon Key dynamically via its local provisioning portal and saves them in NVS flash. |
| **5 Simultaneous Display Surfaces (Rule 3)** | 1. **Serial Monitor** (Structured `[LEVEL-XX][SURFACE]` logs)<br>2. **Local Status Page** (Embedded HTML/JS served directly from ESP32-S3 IP)<br>3. **Web Dashboard** (Public `https://` Next.js app)<br>4. **Light & Buzzer** (Onboard RGB LED for Door State + Active Buzzer)<br>5. **Database Records** (Live Supabase Table Editor + Dashboard DB Drawer) |
| **Simulated Door (Rule 3)** | No servo/motor. Door state (`LOCKED` / `UNLOCKED`) is maintained in ESP32 NVS, reflected immediately on the onboard RGB LED, Local Status Page, and Next.js Web Dashboard. |
| **Offline & Power-Loss Resilience (Section 1)** | State and unsynced attendance/safety events are buffered in ESP32 LittleFS/NVS when Wi-Fi or cloud disconnects, automatically flushing to Supabase upon reconnection. |
| **12 Sequential Levels Adaptability (Section 2)** | Every database table includes a `level_tag` (`level-01` to `level-12`) and an `extra_data JSONB` column so new fields demanded by specific levels require zero database migrations during the 7-hour timer. |

---

## 2. Design System & UI/UX Specification (Inspired by Reference UI, Zero AI Slop)

Your reference screenshot succeeds because it uses **Atmospheric Minimalism & High-Craft Light Mode**—warm alabaster surfaces, soft pastel semantic tint blocks, floating pill navigation, generous whitespace, and clear typographic hierarchy. To avoid generic "AI slop" (neon dark-mode gradients, glowing borders, cluttered gauges), every UI prompt below enforces these strict design tokens:

### 2.1 Color Palette & Surface Hierarchy
* **App Canvas Background:** Cool Alabaster (`#F4F6FB`) with a subtle radial mesh warmth in the top-left (`#EEF2FF` to `#F8FAFC`).
* **Primary Card Surface:** Pure Crisp White (`#FFFFFF`) with a `1px solid #E2E8F0` border and diffused elevation shadow (`0 10px 30px -10px rgba(15, 23, 42, 0.04)`).
* **Left KPI Summary Cards (Soft Pastel Semantic Tints — Inspired by Reference Left Column):**
  * **Attendance / Students Tint:** Soft Periwinkle (`#EEF2FF` background, `#4F46E5` icon badge).
  * **Environment / Thermal Tint:** Soft Sky Cyan (`#ECFEFF` background, `#0891B2` icon badge).
  * **Simulated Door & RFID Access Tint:** Soft Mint Emerald (`#ECFDF5` background, `#059669` icon badge) when `UNLOCKED`, or Soft Amber (`#FFFBEB` background, `#D97706` icon badge) when `LOCKED`.
  * **Safety & Flame/Panic Tint:** Soft Rose Coral (`#FFF1F2` background, `#E11D48` icon badge) — escalates to high-contrast crimson pulse (`#DC2626`) during an active Flame or Touch Panic event.
* **Primary Brand Accent:** Royal Classroom Indigo (`#4F46E5` hover `#4338CA`).
* **Typography Tokens:**
  * **Primary Text:** Deep Slate (`#0F172A`)
  * **Secondary Text:** Muted Slate (`#475569`)
  * **Technical / Telemetry / Timestamps:** `JetBrains Mono` (`#64748B`) with `font-variant-numeric: tabular-nums` so live stopwatch/sensor numbers never jitter horizontally.

### 2.2 Layout & Ergonomic Rules (12-Column Bento Grid)
* **Top Navigation Bar:** Centered floating pill container (`rounded-2xl`, `#FFFFFF`, subtle shadow) featuring icon-over-label navigation tabs (`Dashboard`, `Vision & Attendance`, `Safety & Access`, `History & DB Logs`, `Remote OTA & Config`), flanked by the Brand Logo + Live `Room ID` badge on the left and a real-time Connection / Latency Pill (`ESP32 Online • 42ms • RSSI -58dBm`) on the right.
* **3-Zone Main Viewport (Fits 100% on a 1080p laptop screen without vertical scrolling during judging):**
  * **Left Column (3 Cols):** 4 vertical stacked pastel KPI cards (Attendance Count, Room Temp & Humidity, Simulated Door State + Teacher/Student RFID Last Scan, Safety & Panic Status).
  * **Center Column (6 Cols):**
    * *Top Half:* Dual-mode **Classroom Telemetry & Vision Hub** (switches smoothly between a spline area chart of Temperature/Humidity/Wi-Fi RSSI and the Live ESP32-S3 Camera + Face Recognition viewport).
    * *Bottom Half (Split 2-Column):* **Live RFID & Face Check-In Stream** (left) and **Searchable Event & Database History** (right).
  * **Right Column (3 Cols):**
    * *Top Card:* **On-the-Spot Judge Configurator** (Live edit controls for `Room ID`, `Class Start Time`, `Temp Threshold`, and `Simulated Door Toggle`—directly addressing Rule 3 No Hard-Coding).
    * *Middle Card:* **ESP32-S3 Hardware Pin & Surface Monitor** (Live status of DHT11, RC522, Flame DO, Touch Panic Pad, Buzzer, and Onboard RGB LED color indicator).
    * *Bottom Card:* **Dark Indigo Spotlight Card** (matching the bottom-right dark card in your screenshot) repurposed as the **OTA Firmware & Level Tag Controller** (`Current Tag: level-01`, one-click `.bin` OTA trigger, and offline buffer sync counter).

---

## 3. Sequential Prompt Suite (Copy-Paste Workflow)

Use the following 6 self-contained prompts in order with your AI coding assistant (Cursor, Windsurf, Claude, etc.) to generate the entire system cleanly.

---

### PROMPT 1: Supabase Database Schema, Realtime Publication & Storage Setup
*Use this prompt first to generate the SQL migration script for your Supabase SQL Editor.*

```markdown
You are a Senior Backend & IoT Database Architect. Generate a complete, production-ready PostgreSQL migration script for Supabase to power an "AI-Powered Smart Classroom: Safety, Access and Vision" system using an ESP32-S3-CAM for a 12-level sequential hackathon.

### Core Requirements:
1. **No Hard-Coding Support:** Create a `classroom_config` table that stores dynamic judge-provided test values on the spot:
   - `id` (UUID, primary key)
   - `room_id` (TEXT, not null, default 'BUBT-ROOM-101')
   - `class_start_time` (TIME, not null, default '09:00:00')
   - `temp_threshold_c` (NUMERIC, default 35.0)
   - `door_state` (TEXT check in ('LOCKED', 'UNLOCKED'), default 'LOCKED')
   - `alarm_active` (BOOLEAN, default false)
   - `led_color_state` (TEXT, default 'RED_LOCKED')
   - `target_ota_version` (TEXT, default 'level-01')
   - `target_ota_url` (TEXT, nullable)
   - `extra_settings` (JSONB, default '{}'::jsonb) -- for future levels 1-12
   - `updated_at` (TIMESTAMPTZ, default now())

2. **Live Telemetry & Wi-Fi RSSI Table (`telemetry_logs`):**
   - `id` (BIGSERIAL, primary key)
   - `room_id` (TEXT, not null)
   - `temperature_c` (NUMERIC)
   - `humidity_pct` (NUMERIC)
   - `wifi_rssi_dbm` (INTEGER)
   - `flame_detected` (BOOLEAN, default false)
   - `panic_touched` (BOOLEAN, default false)
   - `door_state` (TEXT)
   - `level_tag` (TEXT, default 'level-01')
   - `extra_data` (JSONB, default '{}'::jsonb)
   - `created_at` (TIMESTAMPTZ, default now())

3. **Access & Attendance Table (`attendance_logs`):**
   - `id` (BIGSERIAL, primary key)
   - `room_id` (TEXT, not null)
   - `person_name` (TEXT, not null)
   - `role` (TEXT check in ('STUDENT', 'TEACHER', 'UNKNOWN'), not null)
   - `auth_method` (TEXT check in ('RFID_WHITE_CARD', 'RFID_BLUE_TAG', 'FACE_RECOGNITION', 'DUAL_RFID_FACE', 'REMOTE_DASHBOARD'))
   - `rfid_uid` (TEXT, nullable)
   - `face_confidence` (NUMERIC, nullable)
   - `snapshot_url` (TEXT, nullable)
   - `attendance_status` (TEXT check in ('ON_TIME', 'LATE', 'TEACHER_ACTION', 'DENIED'))
   - `door_action_triggered` (TEXT, nullable)
   - `is_offline_synced` (BOOLEAN, default false)
   - `level_tag` (TEXT, default 'level-01')
   - `extra_data` (JSONB, default '{}'::jsonb)
   - `created_at` (TIMESTAMPTZ, default now())

4. **Safety & System Events Table (`security_events`):**
   - `id` (BIGSERIAL, primary key)
   - `room_id` (TEXT, not null)
   - `event_type` (TEXT check in ('FLAME_ALERT', 'TOUCH_PANIC', 'HIGH_TEMP', 'DOOR_TOGGLE', 'OTA_UPDATE', 'OFFLINE_SYNC', 'CONFIG_CHANGE'))
   - `severity` (TEXT check in ('INFO', 'WARNING', 'CRITICAL'))
   - `description` (TEXT, not null)
   - `response_ms` (INTEGER, nullable) -- to help record test table metrics for write-ups
   - `level_tag` (TEXT, default 'level-01')
   - `extra_data` (JSONB, default '{}'::jsonb)
   - `created_at` (TIMESTAMPTZ, default now())

5. **Realtime & Storage:**
   - Enable Supabase Realtime (`supabase_realtime` publication) on ALL 4 tables so the Next.js dashboard updates in <100ms without page reloads.
   - Create storage buckets `classroom-snapshots` (for ESP32-S3 camera captures and enrolled faces) and `firmware-ota` (for `.bin` files).
   - Provide clean, permissive RLS policies suitable for rapid hackathon hardware ingestion using the Supabase Anon/Service key stored in environment variables.
   - Insert 1 default row into `classroom_config` and 3 realistic seed rows into each log table so the dashboard renders immediately upon deployment.
```

---

### PROMPT 2: Next.js 15 Core Architecture, Design System & Real-Time Data Layer
*Use this prompt to scaffold the Next.js project, Tailwind tokens, and Supabase Realtime hook.*

```markdown
You are a Staff Frontend Architect and UI Designer. Set up a Next.js 15 (App Router, TypeScript, Tailwind CSS, Lucide Icons, Recharts) application for the "FastRobox 1.0 Smart Classroom" platform.

### Strict Aesthetic & Anti-AI-Slop Directives:
- **Theme:** High-Craft Light Mode inspired by modern EdTech dashboards. NEVER use generic dark-mode neon cyberpunk gradients.
- **Background:** `#F4F6FB` cool alabaster canvas.
- **Cards:** Pure white `#FFFFFF`, `rounded-2xl`, `border border-slate-200/80`, soft diffused shadow `shadow-[0_10px_30px_-10px_rgba(15,23,42,0.04)]`.
- **Typography:** `Plus Jakarta Sans` or `Inter` for UI; `JetBrains Mono` with `tabular-nums` for all live sensor values, timestamps, RSSI, and stopwatch counters.
- **No Secrets in Code:** Load `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` strictly from `.env.local`. Include a `.env.example` file.

### Tasks to Implement in this Step:
1. **`lib/supabase.ts`**: Initialize the Supabase browser and server clients safely.
2. **`types/classroom.ts`**: Define strict TypeScript interfaces matching the 4 Supabase tables (`ClassroomConfig`, `TelemetryLog`, `AttendanceLog`, `SecurityEvent`).
3. **`hooks/useSmartClassroom.ts`**: Build a unified custom hook that:
   - Fetches initial state from `classroom_config`, `telemetry_logs` (last 30 points), `attendance_logs` (last 50 rows), and `security_events` (last 50 rows).
   - Subscribes to a single multiplexed Supabase Realtime channel (`postgres_changes` on all 4 tables) and updates React state instantaneously (<50ms).
   - Tracks the time since the last ESP32 heartbeat to compute live `isDeviceOnline` status and round-trip latency in milliseconds.
   - Exposes mutation functions: `updateConfig(partialConfig)`, `toggleSimulatedDoor()`, `triggerRemoteAlarm(active)`, and `logManualEvent()`.
4. **API Route (`app/api/esp32/sync/route.ts`)**:
   - Create a single ultra-fast `POST` endpoint for the ESP32-S3-CAM to push telemetry, RFID scans, flame/panic alerts, or batch offline-buffered records, and immediately return the current `classroom_config` JSON in the HTTP response body (so the ESP32 gets remote settings & door state in a single HTTP round-trip to beat judge stopwatch limits).
```

---

### PROMPT 3: The High-Craft Bento Dashboard UI (3-Zone Layout + Top Pill Nav)
*Use this prompt to build the main visual interface inspired by your reference screenshot.*

```markdown
You are a Principal Product Designer & Frontend Engineer. Build the main `app/page.tsx` dashboard and modular components using the `useSmartClassroom` hook.

### Visual Structure (Inspired by Reference UI — Strictly No Clutter):
1. **Top Header Bar (`components/TopNav.tsx`):**
   - Left: Brand mark (`SmartClass AI` with a royal indigo cube icon) + a live editable pill showing current `Room ID` (e.g., `BUBT-ROOM-101`) and `Class Start: 09:00 AM`.
   - Center: Floating white pill container (`bg-white rounded-2xl p-1.5 shadow-sm border border-slate-200/80`) with 5 navigation tabs (`Dashboard`, `Vision & Face AI`, `Access & RFID`, `Searchable History`, `Judge Evidence View`). Active tab gets a vibrant Royal Indigo (`bg-indigo-600 text-white shadow-sm`) rounded pill fill.
   - Right: Live Hardware Heartbeat indicator (`ESP32-S3 ONLINE • RSSI -54 dBm`), a quick "Emergency Reset" button, and Team ID badge.

2. **Left Column — 4 Soft Pastel Semantic KPI Cards (`components/KpiColumn.tsx`):**
   - Design each card with a soft pastel background, a bold rounded square icon badge in the top-left, a large `tabular-nums` metric (`text-3xl font-bold text-slate-900`), and a bottom micro-status badge:
   - **Card 1 (Attendance Summary - Soft Periwinkle `#EEF2FF`):** Shows total students checked in today, On-Time vs Late breakdown (calculated dynamically against `class_start_time`), and last checked-in student name.
   - **Card 2 (Classroom Climate - Soft Cyan `#ECFEFF`):** Live `DHT11` Temperature (`°C`) & Humidity (`%`) + Wi-Fi Signal (`dBm`). Highlights amber if approaching `temp_threshold_c`.
   - **Card 3 (Simulated Door & RFID State - Soft Mint `#ECFDF5` when UNLOCKED / Soft Amber `#FFFBEB` when LOCKED):** Prominently displays `UNLOCKED` or `LOCKED`, mirrors the ESP32 onboard RGB LED color state, shows the last RFID scan (`White Card: Student` or `Blue Tag: Teacher`), and includes an instant 1-click Lock/Unlock override button.
   - **Card 4 (Safety, Flame & Panic Monitor - Soft Rose `#FFF1F2`):** Displays `SAFE` by default. If `flame_detected` or `panic_touched` is true, this card and a top banner pulse in high-contrast Crimson (`#DC2626 text-white`) with an audio/visual alert and a 1-click "Acknowledge & Silence Buzzer" button.

3. **Center Column — Telemetry Spline Chart, Vision Feed & Split Activity Lists:**
   - **Top Card (`components/ClassroomPerformanceCard.tsx`):** Inspired by the "Class Performance" spline chart in the reference UI. Features a header toggle to switch between:
     - *Mode A (Environmental & RSSI Spline Chart):* Smooth Recharts dual-area spline curve with soft orange (`#F97316`) for Temperature and royal indigo (`#4F46E5`) for Humidity/RSSI, complete with floating pill tooltips.
     - *Mode B (Live ESP32-S3 Vision & Face Recognition Hub):* Shows the live MJPEG stream or latest high-speed snapshot from the ESP32-S3-CAM, overlaid with bounding-box status, recognized student name, confidence percentage, and a button to enroll a teammate/judge face on the spot (Rule 3 Test People).
   - **Bottom Left Card (`components/LiveAccessFeed.tsx`):** Styled like "Today's Classes" in the reference UI—vertical timeline list with colored time dots (`09:02 AM`), role icons (`Student White Card`, `Teacher Blue Tag`, `Face Verified`), status pills (`ON TIME`, `LATE`, `DOOR UNLOCKED`), and offline-sync badges.
   - **Bottom Right Card (`components/SearchableHistoryCard.tsx`):** Styled like "Recent Assignments" in the reference UI—instant search bar + filter pills (`All`, `Attendance`, `Flame/Panic`, `Door`, `OTA`) querying live history with 1-click CSV/JSON export for level write-ups.

4. **Right Column — On-the-Spot Judge Config, Hardware Surface & OTA Spotlight:**
   - **Top Card (`components/JudgeLiveConfigCard.tsx`):** Clean form allowing instant live updates to `Room ID`, `Class Start Time`, `Temp Alert Threshold`, and `Current Level Tag (level-01 to level-12)`. Saving updates Supabase immediately and pushes to the ESP32-S3 on its next heartbeat (Zero Hard-Coding compliance).
   - **Middle Card (`components/HardwareSurfaceMonitor.tsx`):** Visual checklist of the 6 allowed hardware items (`ESP32-S3 RGB LED`, `RC522 RFID`, `DHT11`, `IR Flame DO`, `Active Buzzer`, `Touch Panic Wire`) showing live pin states so judges can verify hardware-to-cloud parity at a glance.
   - **Bottom Dark Spotlight Card (`components/OtaSpotlightCard.tsx`):** Deep royal indigo gradient (`from-indigo-950 via-indigo-900 to-slate-900 text-white rounded-2xl p-5`) matching the bottom-right spotlight card in the reference image. Houses the **Remote Firmware OTA Updater** (upload/select `.bin` URL, trigger ESP32 OTA update) and displays the **Offline Resilience Buffer Counter**.
```

---

### PROMPT 4: Built-In "5th Display Surface" (Live Database Records Inspector & Write-Up Generator)
*Use this prompt to add a dedicated drawer/tab that satisfies the `Database records` display surface and speeds up your 2-page PDF write-ups.*

```markdown
You are a Full-Stack Developer optimizing a hackathon dashboard for live judging and rapid evidence generation. Build `components/JudgeEvidenceAndDbView.tsx`.

### Requirements:
1. **Live Raw Database Records Surface:**
   - Render a multi-tab raw database table inspector (`classroom_config`, `telemetry_logs`, `attendance_logs`, `security_events`) showing exact PostgreSQL primary keys (`id`), `created_at` timestamps with millisecond precision, `level_tag`, and formatted `extra_data JSONB` payloads.
   - Highlight newly inserted rows with a 2-second emerald flash so judges watching the `Database records` surface see instant visual proof of insertion.
2. **Built-in Stopwatch & Response-Time Logger:**
   - Include an on-screen digital stopwatch with millisecond precision (`00:00.00`) that can stay pinned in the corner of the dashboard during video recording (satisfying Section 5.1 "visible clock or stopwatch in video").
   - Automatically calculate and display the latency (`response_ms`) between an ESP32 event timestamp and Web Dashboard receipt.
3. **1-Click Level Write-Up Markdown Exporter:**
   - Generate a pre-filled Markdown/HTML table for the current `level-XX` containing the 5 required PDF headings from Section 5.2: `(1) Design`, `(2) Where it shows`, `(3) Test results` (auto-populated with measured values from the latest database logs), `(4) Problems and fixes`, and `(5) Extra item`.
```

---

### PROMPT 5: ESP32-S3-CAM Breadboard-Free Wiring Plan & Embedded "Local Status Page"
*Use this prompt to generate the ESP32-S3 local web server (`http://192.168.x.x`) that satisfies the `Local status page` surface and dynamic Wi-Fi/Room provisioning.*

```markdown
You are an Embedded Systems Engineer specializing in the ESP32-S3-CAM. Create the complete single-header HTML/CSS/JS string (`local_status_page.h`) to be served directly from the ESP32-S3's internal web server, plus the exact Breadboard-Free GPIO Pinout Matrix.

### 1. Breadboard-Free Safe GPIO Mapping for ESP32-S3-CAM:
Assign safe pins that do NOT conflict with the OV2640 Camera, PSRAM, or USB Serial (`GPIO 19/20` or `U0TXD/U0RXD`):
- **RC522 RFID (SPI):** `SDA/SS`, `SCK`, `MOSI`, `MISO`, `RST`
- **DHT11 Sensor:** 1 digital GPIO pin
- **IR Flame Sensor (3-pin DO):** 1 digital input GPIO pin
- **Active Buzzer (2-pin):** 1 digital output GPIO pin
- **Touch Panic Pad (Jumper wire with exposed metal tip):** 1 capacitive touch-capable GPIO pin on ESP32-S3 (`T1`–`T14`)
- **Onboard RGB LED (`WS2812` / NeoPixel on GPIO 48 or onboard status LED) & `BOOT` button (`GPIO 0`):** Document exact usage for simulated door state (`GREEN = UNLOCKED`, `RED = LOCKED`, `BLUE FLASH = RFID/FACE SCAN`, `RED/WHITE STROBE = FLAME/PANIC`).
- Include a practical tip on how to join `3.3V` and `GND` jumper wires cleanly (e.g., using female-to-female daisy-chain harnesses made purely from the provided Jumper Wires set) since breadboards are strictly forbidden by Section 4.

### 2. Embedded `Local Status Page` (`local_status_page.h`):
- Must use ZERO external CDN dependencies so it renders 100% offline when the internet or cloud is disconnected.
- Styled in the same clean Alabaster & Royal Indigo light theme as the cloud dashboard.
- **Live Auto-Refreshing Telemetry (`fetch('/api/local-status')` every 1000ms):**
  - Displays current `Room ID`, `Class Start Time`, `Simulated Door State (LOCKED / UNLOCKED)`, `Temperature`, `Humidity`, `Flame Sensor State`, `Touch Panic State`, `Wi-Fi RSSI`, `Last RFID UID & Role`, and `Offline Queued Logs Count`.
- **On-the-Spot Judge Provisioning Form (`POST /api/local-config`):**
  - Allows updating `Wi-Fi SSID`, `Wi-Fi Password`, `Supabase API Endpoint`, `Supabase Anon Key`, `Room ID`, and `Class Start Time` directly from a laptop or phone browser and saves them to ESP32 `Preferences` (NVS flash) without re-uploading code (100% compliance with Rule 3 No Hard-Coding & No Secrets in Code).
- **Local Controls:**
  - Instant buttons to Toggle Door (`LOCK / UNLOCK`), Trigger/Silence Buzzer, and Enter SoftAP Provisioning Mode (`BOOT` button fallback).
```

---

### PROMPT 6: Complete ESP32-S3-CAM Non-Blocking Firmware (`main.ino` / PlatformIO)
*Use this prompt to generate the modular firmware that ties together all 6 hardware components, NVS storage, offline buffering, camera snapshots, and cloud syncing.*

```markdown
You are a Senior Embedded IoT Firmware Architect. Write the complete, modular, non-blocking Arduino/PlatformIO C++ firmware for the `ESP32-S3-CAM` that integrates with `local_status_page.h` and the Next.js `/api/esp32/sync` endpoint.

### Mandatory Functional & Rulebook Requirements:
1. **Zero Hard-Coded Values / Zero Secrets in Code:**
   - Load `wifi_ssid`, `wifi_pass`, `api_url`, `api_key`, `room_id`, and `class_start_time` from `Preferences` (NVS namespace `"fastrobox"`).
   - If Wi-Fi fails to connect within 8 seconds or the `BOOT` button (`GPIO 0`) is held for 3 seconds, automatically start a fallback Wi-Fi Access Point (`FastRobox-Setup-AP`) serving the `Local Status Page` so judges can enter new Wi-Fi credentials on the spot.
2. **Non-Blocking Loop & Stopwatch-Grade Responsiveness (<500ms):**
   - Never use `delay()` in the main loop. Use `millis()` timers or FreeRTOS tasks so Flame Detection, Touch Panic Pad, and RFID scans trigger the Active Buzzer, Onboard RGB LED, Serial Monitor, and Cloud Sync immediately.
3. **Peripheral Logic:**
   - **IR Flame Sensor & Touch Panic Wire:** Immediate critical interrupt/poll. Turns on Active Buzzer alarm pattern, sets RGB LED to rapid strobe, logs `[CRITICAL][FLAME_OR_PANIC]` to Serial Monitor, updates Local Status Page, and fires an immediate high-priority HTTP POST to the cloud.
   - **RC522 RFID Reader:** Distinguishes between the **White Card (Student Check-In)** and **Blue Key-Tag (Teacher Action / Door Unlock Toggle)**. Triggers a short feedback beep on the Active Buzzer, captures a camera frame if Vision mode is enabled, and logs attendance.
   - **Simulated Door State:** Stored in NVS (`door_locked` boolean) so if power is unplugged and plugged back in, the door remembers its exact `LOCKED`/`UNLOCKED` state (Section 1 power-loss resilience) and sets the onboard RGB LED accordingly (`RED` = Locked, `GREEN` = Unlocked).
4. **Offline Queue & Auto-Resync (Network Resilience):**
   - If Wi-Fi or the internet drops, store up to 50 attendance/security events in a circular ring buffer in LittleFS/NVS. As soon as connectivity returns, flush all buffered events to `/api/esp32/sync` with `"is_offline_synced": true`.
5. **Structured Serial Monitor Output (1st Display Surface):**
   - Print clean, human-readable, single-line logs every time a state changes or a sensor updates, formatted for judge inspection:
     `[FASTROBOX][L01][ROOM:BUBT-101] DOOR:UNLOCKED | TEMP:28.4C | HUM:62% | RSSI:-55dBm | FLAME:SAFE | PANIC:IDLE | QUEUE:0`
6. **Remote OTA Firmware Update Support:**
   - Include an `HTTPUpdate` handler that checks if `target_ota_version` from the cloud config differs from the current firmware tag, downloads the `.bin` binary over HTTPS, flashes it, and reboots cleanly.
```

---

## 4. Game-Day Execution Checklist (7-Hour Strategy)

1. **Pre-Competition Setup (Allowed by Rule 3):**
   - Run **Prompts 1–4** and deploy your Next.js dashboard to Vercel (`https://your-team-smartclass.vercel.app`).
   - Run **Prompts 5–6** and flash the base skeleton onto your own test ESP32-S3-CAM at home; verify all `.env.local` secrets are excluded from Git and your repository has a clean commit history.
2. **4-Quadrant Judge Screen Setup (For Live Calls & Video Recording):**
   - **Top-Left:** VS Code / Arduino Serial Monitor (`115200 baud`).
   - **Bottom-Left:** ESP32 `Local Status Page` (`http://192.168.x.x`).
   - **Top-Right:** Public `HTTPS` Next.js Web Dashboard (with the on-screen stopwatch active).
   - **Bottom-Right:** Supabase Table Editor (`Database records` surface).
3. **4 Judging Calls Strategy (Rule 2.1):**
   - **Call 1:** Levels 1, 2, 3 (Core setup, dynamic config, basic sensors/door).
   - **Call 2:** Levels 4, 5, 6 (RFID attendance, safety alerts, web sync).
   - **Call 3:** Levels 7, 8, 9 (Vision/face recognition, searchable history, remote config).
   - **Call 4:** Levels 10, 11, 12 (Offline resilience, power-loss recovery, OTA firmware update).