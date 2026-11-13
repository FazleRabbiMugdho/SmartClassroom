# FastRobox 1.0 — AI-Powered Smart Classroom

Team project for the FastRobox 1.0 Techathon Grand Finale (one ESP32-S3-CAM, 12 sequential levels).

**Status:** Levels 1, 2 and 3 are implemented. Levels 4–12 are not started. Nothing has been tested on the real board yet (UNVERIFIED).

## Repository map

| Folder | What it is |
|---|---|
| `docs/` | Question paper, judges' checklist, pin connections, blueprint |
| `firmware/` | ESP32-S3 firmware (PlatformIO). One module per level under `src/levels/` |
| `platform/` | Backend for Level 2 (Node.js + SQLite): secure ingest, replay rejection, online/offline |
| `wokwi/` | Wokwi circuit project |
| `kicad/` | KiCad schematic project |

## How the levels stack

Each level is its own module and only depends on the ones before it. Shared services live in `firmware/src/core/` (shared state, light arbiter, event bus, serial commands). A new level adds files and one line in `firmware/src/main.cpp`; it does not change earlier levels. See `firmware/src/levels/README.md`.

## Build and run the firmware

1. Install VS Code and the PlatformIO extension.
2. Wire the board as in `docs/FastRobox_Pin_Connections.md`.
3. Open the `firmware` folder. Set your Team ID in `platformio.ini` (`-DTEAM_ID=\"T01\"`).
4. Build, upload the program, then upload the web pages (LittleFS):

   ```bash
   pio run -e esp32s3 -t upload
   pio run -e esp32s3 -t uploadfs
   ```
5. Open the Serial Monitor at 115200 baud:

   ```bash
   pio device monitor -b 115200
   ```
6. On the first start the device creates the access point `SmartClass-<TeamID>`. Its 8-character password is printed on the Serial Monitor. Join it, open `http://192.168.4.1`, then choose the Wi-Fi network, password, Room ID, device token and platform address.

No Wi-Fi password, token or key is stored in the code or this repository. They are typed on the setup page and saved in the board's flash.

## Build and run the platform (Level 2)

Needs Node.js 22.5 or newer.

```bash
cd platform
cp .env.example .env        # then edit .env with your own long random tokens
node --env-file=.env --experimental-sqlite server.mjs
```

- The device must reach the platform over **HTTPS** with a valid certificate. Deploy `platform/` on a host that provides HTTPS (Render, Fly.io, Railway, a Cloudflare Tunnel, and similar), set `DEVICE_TOKENS` and `ADMIN_TOKEN` in the host's environment settings, and enter that public address on the device's setup page.
- Records: open `/records` on the platform and enter the admin token.
- Run the self-test: `cd platform && node --experimental-sqlite test/smoke.mjs`

### Checklist A4: send an old message again (replay test)

Send the same `seq` twice. The second request must return `409` and the record count must not change:

```bash
curl -i -X POST https://YOUR-HOST/api/ingest/event \
  -H "Authorization: Bearer YOUR_DEVICE_TOKEN" -H "Content-Type: application/json" \
  -d '{"device_id":"T01-D1","room_id":"R-101","seq":1,"ts":1760000000,"type":"CARD_TAP","detail":"uid=AA:BB:CC:DD"}'
```

### Level 3: Reset fire from the platform

Open `https://YOUR-HOST/records`, enter the admin token, then press **Reset fire** (device `T01-D1`). The device picks the command up within about 3 seconds. Or from a terminal:

```bash
curl -X POST https://YOUR-HOST/api/admin/commands \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d '{"device_id":"T01-D1","type":"RESET_FIRE"}'
```

The device refuses Reset fire while the flame is still present. Level 4 replaces this admin token with Teacher and Admin logins and a dashboard button.

## Level 3 design notes (for the write-up)

- **Thresholds:** Warning at 32 C or 85% RH, Danger at 40 C. Leave Danger at 38 C or below, leave Warning at 30 C or below with humidity at 80% or below. A new status counts after 3 seconds; each change is a `STATUS` event. Heat never changes the door.
- **Heat index:** NWS Rothfusz regression (Steadman below 80 F), computed on the device.
- **Bad readings:** outside 0–50 C or 20–90% RH, or a failed sensor, sets quality to `bad`, keeps the last status and is never used.
- **Fire latch:** flame held 2 seconds gives FIRE at once, door UNLOCKED, saved in flash. Only a Teacher tag silences the buzzer, and only after the flame is gone. The door stays UNLOCKED until Reset fire.
- **Panic pad:** GPIO1, baseline calibrated at start-up and printed on Serial; 2 seconds of touch raises PANIC for 10 seconds, a shorter touch is ignored.

## Level 2 design notes (for the write-up)

- **Setup:** no saved network, the device opens `SmartClass-<TeamID>` with a random 8-character password printed on Serial, page at `192.168.4.1`, blue light. Wi-Fi name, password, Room ID, device token and platform address are saved in flash (NVS).
- **Status page:** served from LittleFS at the device IP and at `http://smartclass-<teamid>.local` (mDNS), refreshed every second.
- **Reconnect:** a dropped connection retries with gaps of 1, 2, 4, 8, 15 and 30 seconds without restarting. After a power cut it reconnects using the saved details. A first connection that fails within 12 seconds sends the device back to setup mode with the error shown. Holding BOOT for 5 seconds, or the Serial command `reset`, clears the saved details.
- **Telemetry:** JSON every 5 seconds, events at once, over HTTPS. The server certificate is checked against the ESP32 root certificate bundle. The token comes from flash. `ts` comes from NTP, `seq` is saved in flash with a high-water mark so it is never reused.
- **Platform:** `(device_id, seq)` is unique across telemetry and events, so a replay returns 409. A device silent for 20 seconds is marked offline and online again when it returns.
