# FastRobox 1.0 — Firmware

ESP32-S3-WROOM CAM (N16R8) firmware, PlatformIO + Arduino framework.

**Current scope: Levels 1, 2 and 3.**
- **Level 1:** dual-core tasks, 2 Hz heartbeat, sensor reads, fixed `[STATUS]` line, serial commands (`help status health tasks ver hang`), task watchdog, BOOT reason, start-up door state, sensor error detection.
- **Level 2:** Wi-Fi setup access point and page, saved settings (NVS), local status page (LittleFS, mDNS), reconnect with growing gaps, NTP time, secure telemetry and events to the platform, never-reused `seq`, `reset` command and BOOT-button reset.

- **Level 3:** overall status Safe/Warning/Danger with 3 s hold and hysteresis, heat index, heat trend, bad-reading handling, flame-to-FIRE in 2 s with a fire latch saved in flash, Teacher tags, touch panic pad, Reset fire from the platform or the serial command `resetfire`.

**Status:** UNVERIFIED on hardware. All three levels compile; the Level 3 rules pass a host test (`test/host`). Pin assignments follow [`../docs/FastRobox_Pin_Connections.md`](../docs/FastRobox_Pin_Connections.md). Not yet run in Wokwi or on the board.

## Files

| Path | Purpose |
|---|---|
| `platformio.ini` | Board, libraries, Team ID (`-DTEAM_ID`), LittleFS |
| `src/pins.h` | GPIO numbers (must match the pin table and `wokwi/diagram.json`) |
| `src/main.cpp` | Starts the core services and the enabled levels in order |
| `src/core/` | Shared state, light arbiter, event bus, serial console |
| `src/levels/level01.*` | Level 1 |
| `src/levels/level02.*`, `level02/` | Level 2 (store, Wi-Fi manager, web server, telemetry) |
| `src/levels/level03.*`, `level03/` | Level 3 (heat, fire, panic). Rules are in `l3_logic.h` |
| `test/host/test_l3_logic.cpp` | PC test of the Level 3 rules (no board needed) |
| `data/index.html`, `data/setup.html` | Local status page and setup page, uploaded to LittleFS |

## Build and flash

1. Install [VS Code](https://code.visualstudio.com/) and the PlatformIO extension, then open the `firmware` folder.
2. Set your Team ID in `platformio.ini` (`-DTEAM_ID=\"T01\"`).
3. Build and upload the program over the **USB-UART** port (CH343), then upload the web pages:
   ```bash
   pio run -e esp32s3 -t upload
   pio run -e esp32s3 -t uploadfs
   ```
4. Open the Serial Monitor at 115200 baud:
   ```bash
   pio device monitor -b 115200
   ```

If two PlatformIO versions are installed and the build fails with `.sconsign` or "opening dependency file" errors, delete `firmware/.pio/build` and build again with one version only.

## Level 3: set up and test

1. **Register the Teacher tag** (the blue key tag). In the Serial Monitor type `teacher add`, then tap the key tag within 30 seconds. `teacher list` shows the saved tags. They are kept in flash.
2. **Check the panic pad.** Type `touch` to see the baseline and the live reading. Touch the bare wire end and type `touch` again: the number should change by more than the threshold. If it does not, tell me and I will tune the threshold.
3. **Fire** (judges' candle only): hold a flame near the flame sensor for 2 seconds. The buzzer sounds, the light flashes red, the door is UNLOCKED. Remove the flame, then tap the Teacher tag to silence it. Send **Reset fire** from the platform's `/records` page (or type `resetfire`) to lock the door again.
4. **Panic:** touch the free metal end for 2 seconds. Light and buzzer run for 10 seconds.
5. **Heat:** warm the DHT11. Warning at 32 C (or 85% RH), Danger at 40 C, back to Safe only at 30 C or below.

Host test of the rules (needs g++, no board):

```bash
g++ -std=c++11 -Isrc test/host/test_l3_logic.cpp -o test/host/test_l3.exe && test/host/test_l3.exe
```

## Known limits

- Flame polarity (`FLAME_ACTIVE_LEVEL` in `level01.cpp`) is an assumption until tested with a safe flame source.
- The RGB LED pin (48) uses `neopixelWrite()` from this Arduino core (2.0.x).
- The touch threshold (20% of the baseline, at least 3000 counts, in either direction) is a first guess for the ESP32-S3 until the pad is tested. The `touch` command prints the numbers for tuning.
- Alarm limits are fixed at 32 C and 40 C in `g_l3_limits` until Level 5 makes them changeable.
- The Teacher tag list is edited from the Serial Monitor for now; the dashboard comes with Level 4.
- Active-buzzer polarity (HIGH = sound) and the flame sensor polarity are assumptions until tested.
- Events that cannot be sent while offline are kept in a small queue (16). Level 12 replaces this with the flash buffer.
- The HTTPS certificate check uses the ESP32 root bundle; it is verified to build, not yet verified against a live server.
