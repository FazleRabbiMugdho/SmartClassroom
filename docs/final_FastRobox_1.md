## FASTROBOX 1.0

## TECHATHON — GRAND FINALE

## Question Paper

## For Participants

## Al-Powered Smart Classroom: Safety, Access and Vision Challenge

12 Sequential Levels

## Time: 7 hours | Total Marks: 500

Microcontroller: ESP32-S3-CAM (one board only)

## Bangladesh University of Business and Technology (BUBT)


## 1. Mission

Build an Al-powered smart classroom on one ESP32-S3-CAM, using only the kit provided, connected to a secure, live-hosted web platform. The system must keep the room safe from heat and fire, control the door, check students in by card and face, understand the classroom through the camera and the Wi-Fi signal, take settings and firmware from the dashboard, keep a searchable history, and keep working when the network or the power fails. It must use the ESP32-S3's own features: both CPU cores, the watchdog, the internal temperature sensor, flash storage, mDNS, over-the-air updates, on-chip face detection, capacitive touch, Wi-Fi CSI and Bluetooth LE. The challenge is one chain of 12 levels. Each level builds on the one before it; nothing built for a later level may remove what was built earlier. Each level is passed in short live checks, with test values chosen by

the judge, and its other tests are shown in the team’s video.

## 2. Rules

## 2.1 Format and Scoring

- Structure. 12 levels in 6 groups, passed in strict order from Level 1 to Level 12. A level can be attempted only after the level before it has been passed.

- Marks. 500 marks, all in the levels; no level is worth more than 50.

- Attempts. Two attempts per level. A pass on the 1st attempt earns full marks; a pass on the 2nd attempt earns 70%. If both attempts fail, that level and every later level are closed.

- Judging calls. Live judging is done in at most four calls. In each call the team names the levels to be judged: one or more consecutive levels, starting with its next level not yet passed. The judge runs the live checks of those levels in order, and one action may count for several levels. If a level fails, the later levels of that call are not judged. A failed level may be tried again (its 2nd attempt) straight away or in a later call.

- Live checks and video. Each level is passed on its live checks; its other tests are shown in the team’s video (“Video must show"). During a call the judge may ask the team to repeat any video item live; if it fails, that level's attempt fails.

- Completion. A level is complete, and its marks are awarded, only when it has been passed live and its evidence (video, write-up, code tag and screenshots) has been uploaded.

- Timing. Judges time with a stopwatch. A time no more than 0.5 seconds over a limit is measured once more in the same attempt, and the better result counts.

- Tiebreaker. With equal scores, the team that passed its last level earlier ranks higher.

- Time. 7 hours on site.

## 2.2 Conduct and Technical Rules

- What teams receive. Only the hardware kit and this question paper. Laptops, phones, phone hotspots, cloud accounts and software are the team's own.

- Preparation. Code may be written and the platform deployed before the event. All source code is kept in a Git repository with its full history, which judges may inspect.

- Test values. Judges choose test values on the spot (for example the Wi-Fi network, the Room ID and class times). Hard-coded values will fail.

- Test people. The team’s own members act as the students in the tests, with their consent. Teams with fewer than three members may ask a judge to act as one student. All face data is deleted after the event.

- Own work. Copied code or models lead to disqualification. Judges may ask any member to explain any part of the code.


- Live platform. The web platform runs on a public HTTPS address. Any library, framework, cloud service or model may be used; every time limit still applies.

- No secrets in code. No password, key or token is written in the firmware or the website code, or stored in the repository.

- Displays. During every test the judges look at the Serial Monitor, the local status page, the web dashboard, the light and buzzer and the database records, as listed for each level under “Where it must show”. The team keeps them open on its own laptop or phone.

- The door. The classroom door is simulated: the device keeps the door state (LOCKED or UNLOCKED) and shows it with the light, on its local page and on the dashboard.

- Safety. Flame tests use only the judges’ own candle. Teams never light anything. Judges stop any unsafe test.

- Disputes. A dispute about an attempt is raised with the judge within 15 minutes; the decision is final. Handle the kit with care and return it complete after the event.

## 3. Equipment Provided

The build may use only these items. No other component, module, breadboard or second microcontroller is allowed. Non-electronic supports (for example a box or books) may be used to position the board and aim the camera.

| Item | Qty | Role in the build |
| --- | --- | --- |
| ESP32-S3-CAM (with camera, onboard RGB | i | Main controller, camera, status light, Wi- |
| LED and BOOT button) |   | Fi and Bluetooth |
| RC522 RFID reader (13.56 MHz) with 1 card | 1set | Student check-in (card) and Teacher |
| and 1 key tag |   | actions (key tag) |
| DHT11 temperature and humidity sensor | 1 | Room heat monitoring |
| IR flame sensor module, 3-pin (VCC, GND, | a | Fire detection |
| DO) |   |   |
| Active buzzer, 2-pin | x | Alarms and feedback beeps |
| Jumper wires | 1set | All connections, and the touch panic pad |
|   |   | (a bare wire end on a touch pin) |
| USB cable | ui | Programming, Serial Monitor and power |

## 4. Device Signals

The onboard RGB LED is the device's only light: its colour shows the state and its blinking is the heartbeat. When several states apply, the one with the lower number is shown.


| No. | State | RGB | Buzzer |
| --- | --- | --- | --- |
| il | Fire | Red, fast flashing (5 times a | 200 ms on / 200 ms |
|   |   | second) | off, continuous |
| 2 | Panic | Red and blue alternating | 100 ms on / 100 ms off |
|   |   |   | for 10 seconds |
| 3 | Access granted (door unlocked) = Solid green for 5 seconds |   | One short beep |
| 4 | Access denied | Three quick red flashes | Two short beeps |
| 5 | Heat Danger | Red, 2 Hz heartbeat | One short beep every |
|   |   |   | 2 seconds |
| 6 | Sensor error | Magenta, 2 Hz heartbeat | — |
| 7 | Camera fault | Cyan, 2 Hz heartbeat | — |
| 8 | Weather Danger notice | Purple, 2 Hz heartbeat | Three beeps once, on |
|   |   |   | arrival |
| 9 | Warning | Yellow, 2 Hz heartbeat |   |
| 10 | Wi-Fi setup mode or offline | Blue, 2 Hz heartbeat | — |
| 11 | Safe (normal) | Green, 2 Hz heartbeat | — |

## 5. Displays and Serial Monitor

Every result in this challenge must appear in a fixed place. The surfaces are listed below; each level then states exactly what must appear on each surface (“Where it must show”). A dash (—) means the surface is not used in that level. Results shown in an earlier level must keep appearing in all later levels.

| Surface | What it | is |
| --- | --- | --- |
| Serial Monitor | The team’s laptop, 115200 baud. Every line starts with a tag in square |   |
|   | brackets: [STATUS], [CARD], [EVENT], [ERROR], [NET], [OTA], |   |
|   | [CAM], [BLE], [CMD]. |   |
| Local status page | The web page served by the ESP32-S3 itself, at its IP address and at |   |
|   | http://smartclass-<teamid>. local. It updates by itself at least |   |
|   | every 2 seconds. |   |
| Web dashboard | The team’s cloud platform (from Level 4, behind login). It updates by itself, |   |
|   | without reloading. |   |
| Light and buzzer | The onboard RGB LED and the buzzer, following the Device Signals table. |   |
| Database | The team's cloud database; the team shows records on request (a query, |   |
|   | table view or export). |   |
| Phone alert | From Level 4: the Teacher's message (email, Telegram or push notification), |   |
|   | shown on the team’s own phone. |   |
| Bluetooth LE | From Level 12: the device's Bluetooth name, seen in any BLE scanner app |   |
|   | on the team's own phone. |   |


## 5.1 Serial Status Line

The device prints one status line every second, in this exact order and format. A field that belongs to a level not yet built is printed as - (for example HI=-).

[STATUS] up=742s T=29.0C RH=64% HI=31.2C flame=0 door=LOCKED state=SAFE trend=STABLE rssi=-61 heap=182k psram=7104k chip=41.5C fw=1.0.0

## 5.2 Serial Commands

Typed in the Serial Monitor (line ending: newline). Each reply starts with [CMD].

| help | Lists all commands. |
| --- | --- |
| status | Prints one status line at once. |
| health | Chip temperature, free heap, free PSRAM, flash size, CPU frequency, Wi-Fi |
|   | RSSI, uptime, last reset reason and firmware version. |
| tasks | Each running task with its CPU core and its free stack. |
| ver | Firmware version and build date. |
| hang | Deliberately freezes the main task, to test the watchdog (Level 1). |
| reset | Clears the saved Wi-Fi details and restarts in setup mode (Level 2). |
| csi | Wi-Fi CSI packets per second, number of subcarriers and the Wi-Fi channel |
|   | (Level 11). |

## 6. Fixed Data Format

All teams use the same telemetry fields, sent every 5 + 1 seconds as JSON. The database treats the pair (device_id, seq) as unique, so a message sent twice is never stored twice.


|   | Rule |
| --- | --- |
| device_id | The device's ID, e.g. T07-D1 |
| room_id | The Room ID entered on the setup page |
| seq | Whole number that only increases, even across restarts; never reused |
| ts | Unix time in seconds (UTC) when the reading was taken — not when it was |
|   | sent |
| uptime_s | Seconds since this start-up |
| temp_c, rh, | Temperature (°C), relative humidity (%) and heat index (°C) |
| heat_index_c |   |
| flame | true when the flame sensor sees a flame |
| door | LOCKED or UNLOCKED |
| status | SAFE, WARNING, DANGER or FIRE |
| heat_trend | RISING, STABLE or FALLING |
| rssi, heap_kb, | Wi-Fi signal (dBm), free heap (KB) and the ESP32-S3's internal |
| chip_temp_c | temperature (°C) |
| fw | Firmware version, e.g. 1.0.0 |
| quality | good when every reading is trustworthy, bad when any is not |

Events are sent at once, with the fields device_id, room_id, seq, ts, type and detail. Device events: BOOT (with the reset reason), STATUS, FIRE, FIRE_CLEARED, SILENCED, PANIC, CARD_TAP (with the UID), ENTRY_GRANTED, ENTRY_DENIED, NO_FACE, OFFLINE_ENTRY, SENSOR_ERROR, SETTINGS_APPLIED, OTA_DONE, OTA_REJECTED, OTA_ROLLBACK. Server events (same fields, with a server ID in place of seq): UNKNOWN_CARD, FACE_MISMATCH, SPOOF, CARD_BLOCKED, STUDENT_DELETED, WEATHER_ALERT, OCCUPANCY, OVER_CAPACITY, INTRUDER, CAMERA_FAULT, CAMERA_OK, HAND_RAISED, PRESENCE, ACK. Every event the device sends or receives is also printed on the Serial Monitor as [EVENT] <type> <detail>.

## Example:

```
{"device_id":"T07-D1","room_id":"R-
"ts" "uptime_s":742,"temp_c":29.0,"rh":64, "heat_index_c":31.2,"flam
e": false, "status": "SAF "rssi":-
61, "heap_kb":182,"chip_temp_c":41.5,"fw":"1.0.0", "quality": "good"}
```

## 7. Evidence for Every Level

Every level needs its own evidence to be complete:

- \+ Video: for every level, at least 720p with clear audio, showing every item listed under “Video must show” for that level, with the Serial Monitor, the local status page and the dashboard visible wherever the level uses them, and a visible clock or stopwatch for timed items. A team member states the team ID and level at the start. At most 10 minutes per level, in up to three unedited clips.

- Write-up (at most two pages per level), with these five headings: (1) Design — what was built, with a diagram; (2) Where it shows — screenshots of the Serial Monitor, the local status page, the dashboard and the database records for this level; (3) Test results — a table with every pass item,


- the measured value and the limit; (4) Problems and fixes; (5) the level's extra item listed under the level. The Test results table covers every live check, every video item (with its time in the video) and every item listed under “Write-up must show" for the level.

- Code: the Level-NN, where NN is the two-digit level number (for example level-03), with its commit hash for the code used in the test; the README is kept up to date from Level 2.

- Upload: to the team's submission folder, named <TeamID>_L<NN>_video.mp4 and <TeamID>_L<NN>_writeup.pdf (for example T07_LO3_video.mp4), no later than 30 minutes after judging closes.

- Completion: a level is complete — and its marks are awarded — only when it has been passed live and its evidence has been uploaded. Missing evidence, or evidence that contradicts what the judge saw, means the level scores zero; later levels are not affected.


## 8. The Levels

## Group 1 — Device Foundation (80 marks)

## Level 1: Dual-Core Tasks, Health and Watchdog

Scenario. The classroom safety device runs many jobs at once and must never freeze; if a part hangs, it must restart itself and report why.

35 marks

## Tasks

- 1. Split the work into separate FreeRTOS tasks on both CPU cores. No blocking waits anywhere.

- 2. The RGB LED blinks at 2 Hz (250 ms on, 250 ms off) in the colour of the current state (green when Safe).

- 3. Read the DHT11 every 5 seconds, the flame sensor every 100 ms and the RFID reader every 200 ms. A card tap is reported once per tap, even if the card is held on the reader.

- 4. Printa [STATUS] line every second in the fixed Serial format, including the ESP32-S3's internal chip temperature, free heap and free PSRAM. Implement the Serial commands help, status, health, tasks, ver and hang.

- 5. Enable the task watchdog: if a task freezes, the board restarts by itself within 10 seconds, and at every start-up prints [EVENT] BOOT reason=<reason> (POWER_ON, SOFTWARE, WATCHDOG, CRASH or BROWNOUT).

- 6. At start-up, check the flame sensor first: no flame — door LOCKED; flame — door UNLOCKED.

- 7. If a sensor fails or is unplugged, print [ERROR] SENSOR ERROR: <name>, switch the light to magenta and keep everything else running: DHT11 within 12 seconds, RFID reader within 3 seconds; the error clears by itself when the sensor returns.

## Where it must show

| Serial Monitor | [STATUS] every second; [CARD] uid=.. once per tap; [ERROR] |
| --- | --- |
|   | ..; [EVENT] BOOT reason=..; replies to help, SENSOR ERROR: |
|   | status, health, tasks, ver. |
| Local status page | — (from Level 2) |
| Web dashboard | — (from Level 4) |
| Light and buzzer | Green 2 Hz heartbeat; magenta while a sensor error lasts. |
| Database | — (from Level 2) |

Judged live: a steady 2 Hz light; one [CARD] line per tap; health and tasks; watchdog restart within 10s.

## Video must show:

- \+ The DHT11 data wire and the RC522 SDA wire unplugged for 15 seconds: SENSOR ERROR for the RFID reader within 3 seconds and for the DHT11 within 12 seconds, with magenta light and no freeze; both clear after reconnecting

Write-up must show: the wiring diagram with every pin connection, and a task diagram (each task, its core and its period); and a [STATUS] line every second in the fixed format; read periods: DHT11 5's, flame 100 ms, RFID 200 ms; flame at start-up gives door UNLOCKED.


## Level 2: Wi-Fi Setup and Secure Telemetry

Scenario. The school installs the device itself, sees its state on a phone, and needs every reading stored safely in the cloud exactly once.

## Tasks

- With no saved network, the device starts the access point SmartClass-<TeamID>, protected by an 8-character password printed on the Serial Monitor at start-up, with a setup page at 192.168.4.1. The light is blue.

- The setup page lists nearby networks with their signal strength, and has fields for the password, the Room ID and the device token. Everything is saved in flash (NVS).

- Once connected, the device serves the local status page at its IP address and at http://smartclass-<teamid>.local (mDNS). The page's files are stored in the board's flash file system (LittleFS). It updates by itself at least every 2 seconds and shows: Room ID, local time (Asia/Dhaka), temperature, humidity, status, flame, door, last card UID, Wi-Fi signal, chip temperature, firmware version and connection state.

- If the Wi-Fi drops, the device reconnects by itself (with increasing retry gaps) without restarting. After a power cut it reconnects with no setup. With a wrong password or an unreachable network it returns to setup mode within 15 seconds and shows the error on the setup page.

- Holding the BOOT button for 5 seconds while the board is running, or the Serial command reset, clears the saved details.

- Everything from Level 1 keeps running during every connection attempt.

- Send telemetry in the fixed format every 5 + 1 seconds over HTTPS or MQTT over TLS, checking the server's certificate, using the device token from the setup page. Send each card tap at once as a CARD_TAP event and each start-up as a BOOT event with the reset reason.

- Use internet time (NTP) for ts. Keep seq increasing and never reused, even after a restart.

- The server stores each message once: a message with a seq it has already stored (a replay) is rejected.

- 1 The platform marks the device offline within 30 seconds of it going silent and online again when it returns. After a backend restart the device reconnects by itself.

- 1 = . No password, key or token is written in the code or stored in the repository. From this level, the repository's README explains how to build and run the firmware and the platform.

## Where it must show

| Serial Monitor | The access-point password at start-up; [NET] lines for connecting, IP |
| --- | --- |
|   | address, mDNS name, disconnection and reconnection; the setup error. |
|   | [NET] lines for each server connection, disconnection and reconnection. |
| Local status page | All fields listed above, updating at least every 2 seconds. Connection state: |
|   | LIVE when the server is reachable. |
| Web dashboard | — (from Level 4) |
| Light and buzzer | Blue heartbeat in setup mode; green when connected and Safe. |
| Database | Telemetry every 5 + 1 s with every field; CARD_TAP and BOOT events; |
|   | device online/offline state. |


Judged live: setup on the hotspot; both page addresses; records every 5 + 1 s; replay rejected; offline shown within 30 s and reconnection with no setup after a power cut.

## Video must show:

- The hotspot switched off for 20 seconds: the device reconnects within 30 seconds without restarting (uptime keeps counting)

- The BOOT button held for 5 seconds: the access point returns; set up with a wrong hotspot password, the device is back in setup mode within 15 seconds and the page shows an error

- The backend stopped for 20 seconds: records resume within 30 seconds without resetting the device

Write-up must show: how the setup page saves the details, the reconnection strategy, the mDNS name, the system architecture diagram (device, server, database, Al services, weather service, dashboard) and how replays are rejected; and HTTPS or MQTT over TLS with the server's certificate checked; no password, key or token in the repository; the README explains how to build and run the system.

## Group 2 — Classroom Safety (50 marks)

## Level 3: Heat, Fire, Panic and Fail-Safe Door 50 marks

Scenario. The room must warn early about heat, open and hold the door in a fire, let only a teacher silence the alarm, and let anyone call for help with one touch.

## Tasks

- 1. One overall status — Safe, Warning or Danger — shown by the light, the local status page and the cloud. A new status counts only after holding for 3 seconds, and each change is a STATUS event.

- 2. Enter Warning at 32 °C or above, or 85% humidity or above. Enter Danger at 40 °C or above (red heartbeat, short beep every 2 seconds). Heat never changes the door.

- 3. Leave each state 2 °C below its limit (Danger at 38 °C, Warning at 30 °C) and, for Warning, with humidity at 80% or below.

- 4. Calculate and show the heat index (“feels like” temperature) from temperature and humidity.

- A failed or impossible reading (outside 0-50 °C or 20-90% humidity) sets quality to bad, keeps the last status and is never used as a real reading.

- 6. Show a Rising, Stable or Falling heat trend from the last 10 temperature readings. The trend must never change the light, the buzzer or the door.

- 7. A flame seen continuously for 2 seconds is FIRE at once (no 3-second hold): continuous buzzer, fast red flashing, FIRE — EVACUATE on the local status page, and the door UNLOCKED. The FIRE event reaches the cloud within 3 seconds.

- 8. The fire state is saved in flash: after a power cut during a fire, the device restarts with the door still UNLOCKED.

- 9. The kit key tag is registered as the Teacher tag; the Teacher tag list is kept in flash. The Teacher tag silences the buzzer only after the flame has gone; a student card never does. The door stays UNLOCKED until a Teacher or Admin sends Reset fire.

- 10. Touch panic pad: a jumper wire on one of the ESP32-S3's capacitive-touch pins, with its free metal end left open, is the panic pad. The touch baseline is calibrated at start-up. Touching the pad for 2 seconds raises PANIC (red and blue alternating light, panic buzzer pattern, PANIC on the local page, PANIC event to the cloud within 3 seconds); a touch shorter than 1 second is ignored.

- lj = . Fire overrides every other door rule. From Level 4, FIRE and PANIC also show a red banner on every logged-in dashboard within 3 seconds.


## Where it must show

| Serial Monitor | [EVENT] STATUS <old>-><new> at each change; the [STATUS] line |
| --- | --- |
|   | includes HI= (heat index) and trend=. [EVENT] FIRE, FIRE_CLEARED, |
|   | SILENCED, PANIC; the touch-pad baseline at start-up. |
| Local status page | Status, heat index, trend and data quality. FIRE — EVACUATE, PANIC, |
|   | door state, CANNOT SILENCE — FLAME PRESENT when refused. |
| Web dashboard | From Level 4: red banner for FIRE and PANIC; the Reset fire button. |
| Light and buzzer | Yellow heartbeat (Warning); red heartbeat with a beep every 2 seconds |
|   | (Danger). Fire and Panic patterns from the Device Signals table. |
| Database | STATUS events; telemetry with heat_index_c, heat_trend and |
|   | quality. FIRE, FIRE_CLEARED, SILENCED and PANIC events with their |
|   | times. |

Judged live: FIRE from a held flame; Teacher-only silence; door still open after a power cut; PANIC from a 2-second touch.

## Video must show:

- Warm air from a hair dryer on the DHT11 until Danger, then cooling: yellow, then red with a beep every 2 seconds; heat index and trend shown; no FIRE and no change to the door; exactly one Danger Warning and one Warning — Safe change, with Safe only at 30 °C or below

- A candle flicked past the flame sensor for about 1 second, and a touch on the panic pad shorter than 1 second: nothing happens

- Gentle warming: the trend shows Rising with no change to the light, the buzzer or the door

- The DHT11 unplugged during Warning: quality shows bad and the status does not fall to Safe

Write-up must show: the safety design note (thresholds, hold time, hysteresis and the heat-index formula used), the fire latch, the Teacher-tag silence rule, the fail-safe door logic and the touch-pad calibration; and the touch-pad baseline is calibrated at start-up.

## Group 3 — Platform and Control (110 marks)

## Level 4: Secure Platform, Roles and Alerts

Scenario. Each person must see only what their role allows, staff must see each device's health, and alarms must reach the teacher's phone.

40 marks

## Tasks

- 1 5 A public HTTPS website with login. Passwords are stored hashed (bcrypt or argon2).

- 2. Four roles, checked by the server on every request: Admin (everything: rooms, devices, users, cards, tags, schedules, settings); Teacher (own classes and rooms; alerts); Student (own attendance only); Guardian (linked children only: today's arrival with entry time, attendance history, Late and Absent notices).

- A live room dashboard that updates within 3 seconds of new data: status, temperature, humidity, heat index, trend, fire state, door, recent card taps, online/offline; the Reset fire button for Teachers and Admins; and the red FIRE / PANIC banner from Level 3 on every logged-in dashboard.

- A device health panel: last seen, uptime, Wi-Fi signal, free heap, chip temperature, firmware version and last reset reason — matching the device's health command.


- 5. Phone alerts: FIRE, PANIC and Heat Danger also send a message (email, Telegram or a push notification) to the Teacher's phone within 10 seconds.

- 6. Language: every dashboard page can be switched between English and Bangla.

- 7. After 5 passwords in a row, the account is locked for 30 seconds — even the correct wrong password is refused. The Admin sees a login history (time, user, success or failure).

- 8. Before the test, the team creates the judges’ accounts (Admin, Teacher, Student S1, Student S2, Guardian linked to S1) and gives the judges the page addresses they will test.

## Where it must show

| Serial Monitor | Reply to health, matching the device health panel. |
| --- | --- |
| Local status page | Unchanged. |
| Web dashboard | Room dashboard, device health panel, FIRE/PANIC banner, |
|   | English/Bangla switch, login history (Admin), role-limited pages. |
| Light and buzzer | Unchanged. |
| Database | Users with hashed passwords; login history; sent phone alerts with their |
|   | times. |
| Phone alert | The Teacher's message for FIRE, PANIC and Heat Danger, shown on the |
|   | team's phone. |

Judged live: two roles chosen by the judge; live dashboard within 5 s; health panel; PANIC banner within 3s and phone message within 10 s; a refused page.

## Video must show:

- All four roles logged in, each seeing only what it is allowed to see

- The dashboard switched to Bangla: all menus and labels in Bangla on two pages, then in English again

- 5 wrong passwords in a row: the correct password is refused for 30 seconds, then accepted; the login history lists the attempts with their times

Write-up must show: the role and permission rules, the device-health data flow and how phone alerts are sent; and passwords stored hashed (bcrypt or argon2); a Teacher-only page opened by a Student, and another child's page opened by the Guardian, are refused with no data.

30 marks

Scenario. Devices are out of reach: alarm limits and firmware must be changed from the dashboard, and a bad update must never leave a room without its safety device.

## Level 5: Remote Settings, OTA and Rollback

## Tasks

- 1. An Admin settings page sets the Warning temperature (default 32 °C) and the Danger temperature (default 40 °C); leaving a state stays 2 °C below its limit. A saved change reaches the device within 10 seconds, is used at once, is kept in flash through restarts, and is reported by a SETTINGS_APPLIED event.

- 2. Invalid values are refused with a clear message: outside 0-50 °C, or a Warning limit not below the Danger limit. Each change is logged with who and when. Only the Admin can open the settings page.

- 3. Over-the-air update: the Admin uploads a firmware file on the dashboard; the device downloads it over HTTPS, checks it, installs it into the other OTA partition and restarts. The new version shows


- on the Serial Monitor (ver), the local status page and the dashboard. Settings, Wi-Fi details and the fire latch are kept. An OTA_DONE event is stored.

- A damaged or incomplete firmware file is rejected current version. the device keeps running its

- Rollback: a new firmware that cannot reach the server within 60 seconds of starting returns the device by itself to the previous version, keeping everything, and an 0TA_ROLLBACK event is stored.

- For the test, have three files ready: a working firmware with a higher version number; a damaged copy of it (for example the same file cut in half); and a faulty firmware that installs correctly but cannot reach the server (for example built with a wrong server address).

## Where it must show

| Serial Monitor | [EVENT] SETTINGS_APPLIED ..; [OTA] lines for download progress, |
| --- | --- |
|   | check result, rollback and the version after each restart. |
| Local status page | Current Warning and Danger limits; firmware version. |
| Web dashboard | Settings page (Admin only) with change log; firmware upload with status; |
|   | firmware version in the device health panel. |
| Light and buzzer | Yellow heartbeat once the new Warning limit is passed (a short blue blink |
|   | pattern during an update is allowed). |
| Database | SETTINGS_APPLIED, OTA_DONE, OTA_REJECTED and OTA_ROLLBACK |
|   | events; the change log. |

Judged live: new limit on the device within 10 s; firmware update within 3 min with settings kept.

## Video must show:

- The DHT11 warmed past the new limit: Warning (yellow) appears after 3 seconds at or above it

- A Warning limit of 45 °C refused with a clear message

- The board switched off and on: the changed limit is still shown and used

- The damaged firmware file rejected with the device keeping its current version, and the faulty firmware installing, then returning by itself to the previous version with an 0TA_ROLLBACK event

Write-up must show: how settings and firmware reach the device, how they are checked, the partition layout and the rollback rule; and a Teacher cannot open the settings page; the change log shows who changed what and when.

40 marks

Scenario. Serious weather warnings must reach every screen and device within seconds, and staff must be able to look back over the day and ask about it.

## Level 6: Weather, History and Al Assistant

## Tasks

- Every dashboard shows the current weather and the next 24-hour forecast for the school’s location, from any public weather service fetched by the server every 15 minutes. The service key never reaches the browser.

- A notice board lists active warnings (storm, cyclone, heavy rain or flood, heatwave) with severity (Advisory, Warning, Danger), source and time window — official alerts if available, otherwise warnings worked out from the forecast and labelled as such.

- A Danger notice shows a red banner on every logged-in dashboard within 10 seconds; within the same 10 seconds every device glows purple, beeps three times and shows WEATHER ALERT with the notice text on its local page.


- The local status page also shows the current weather in one line.

- If the weather service fails, the board shows the last data with its age and Data stale — blank board or an error page. The Admin can add and remove a TEST notice.

- A chart of temperature, humidity and heat index for a chosen period of up to the last 24 hours, drawn from the stored telemetry.

- An event history page that filters events by type and by time range, showing the time of each event.

- A daily report for a chosen day: minimum, maximum and average temperature and humidity; the number of alarms of each type; attendance totals (Present, Late, Absent; zero until Level 7 is built).

- Export of the filtered events, the readings for the chosen period and the daily report as CSV files.

- 1 o . Al assistant: a Teacher types a question in English or Bangla about the room's stored data (for example the highest temperature today, or how many alarms there were) and gets an answer worked out only from the stored data, matching the daily report. A question about data that does not exist is answered “no data” — never invented.

- 1 j= . Teachers see only their own rooms; Students and Guardians cannot open the history, report or assistant pages.

## Where it must show

| Serial Monitor | [EVENT] WEATHER_ALERT <severity> when a notice reaches the |
| --- | --- |
|   | device. |
| Local status page | One-line current weather; WEATHER ALERT with the notice text. |
| Web dashboard | Weather panel, 24-hour forecast, notice board, red Danger banner, Data |
|   | stale label; charts, event history with filters, daily report, CSV export |
|   | buttons, Al assistant. |
| Light and buzzer | Purple heartbeat and three beeps for a Danger notice. |
| Database | Cached weather data with its fetch time; notices; queried by the charts, |
|   | history, report and assistant. |

Judged live: Danger notice on dashboards and device within 10 s; daily report; an assistant answer that matches it.

## Video must show:

- The weather service blocked: the board shows the last data with its age and Data stale

- The chart with the heat peak, the event history filtered to FIRE and PANIC with their times, and its CSV export matching the page

- An assistant question about a date with no data, answered with “no data” and nothing invented

Write-up must show: the weather service used and how warnings are worked out; how the history queries, the daily report and the CSV export are built; and how the assistant is kept to the stored data; and Students and Guardians cannot open the history, report or assistant pages; the weather service key never reaches the browser.


## Group 4 — Card and Face Access (80 marks)

## Level 7: Card and Face Check-In

Scenario. Students check in with their card and their face; parents are told at once about late or absent children.

50 marks

## Tasks

- Enrol students on the platform with at least 3 face images each, after a consent notice. Store face embeddings only and delete the photos. Pre-trained face models are allowed. The team's own members act as the students.

- The Admin links a card to a student with Register card (tap the card on the device) and can remove or change the link.

- On-device face detection: on a card tap, the ESP32-S3 itself detects a face in the camera image and sends only the cropped face, with the card UID, to the server. If no face is found within 3 seconds, the device denies entry by itself with NO FACE, without asking the server.

- The server checks that the face matches the card’s owner and that the student is in the class running now in this room; if both are true the door unlocks for 5 seconds (solid green, one beep). Card tap to unlock: under 5 seconds.

- One attendance record per student per class: Present within the first 10 minutes, Late after that, Absent for any enrolled student not checked in after 30 minutes. A repeat check-in opens the door but adds no record.

- NOW, UNKNOWN CARD. The linked Guardian is notified on the platform within 60 seconds of a Late or Absent mark. Denials show a reason (three red flashes, two beeps): NO IN THIS CLASS,NO CLASS

## Where it must show

| Serial Monitor | [CARD] line; [CAM] FACE w=<px> h=<px> (the size of the face crop) or |
| --- | --- |
|   | [EVENT] NO_FACE; [EVENT] ENTRY_GRANTED <name> or [EVENT] |
|   | ENTRY_DENIED <reason>. |
| Local status page | Last check-in: name, result, reason and time. |
| Web dashboard | Enrolment, card registration, class schedule, attendance records, Guardian |
|   | notifications; a log of the images received for checking, with their size in |
|   | pixels (Teacher and Admin only; the images themselves are not kept). |
| Light and buzzer | Access granted / denied patterns. |
| Database | Embeddings (no photos), card links, attendance records, |
|   | ENTRY_GRANTED, ENTRY_DENIED, NO_FACE events. |

Judged live: NO FACE within 4 s; unlock within 5 s; face crop only; Present, then Late with a Guardian notice within 60 s.

## Video must show:

- A second check-in by A: the door opens but no record is added

- The card registered to C (another class): NOT IN THIS CLASS; the card unregistered: UNKNOWN CARD

- The class start set to 31 minutes ago: D is marked Absent and the Guardian is notified within 60 seconds; A stays Present, B stays Late, and the Guardian sees only B and D


Write-up must show: the privacy note (what face data is stored, where, who can see it, when it is deleted), the on-device detector and the face-match model, threshold and measured accuracy; and consent notice, at least 3 face images per student, embeddings stored and photos deleted; a tap with no class running is denied with NO CLASS NOW.

## Level 8: Spoofing, Lockout and Data Deletion

Scenario. A lent card or a photo must never open the door, repeated attempts must lock the card, alerts are handled once, and a student's face data can be deleted for good.

30 marks

## Tasks

- 1. Card sharing: if the face does not match the card's owner, deny entry (FACE MISMATCH) — never fall back to the card alone — save a private snapshot (Teacher and Admin only) and alert the Teacher within 10 seconds.

- 2. Photo spoofing: a photo of an enrolled student, shown on a phone screen with that student's own card, never unlocks the door.

- 3. Card lockout: three FACE MISMATCH results for the same card within 2 minutes block that card for 5 minutes (CARD BLOCKED, even for its owner), unless the Admin unblocks it on the dashboard.

- 4. Acknowledgment: each alert has an Ack button. If several people press it at the same moment, exactly one acknowledgment is recorded (who and when); the others are told it was already acknowledged.

- 5. Deleting a student: the Admin can delete a student; their face embeddings, card link and snapshots are deleted at once, and an audit log records who deleted whom and when (STUDENT_DELETED).

## Where it must show

| Serial Monitor | [EVENT] ENTRY_DENIED FACE_MISMATCH and [EVENT] |
| --- | --- |
|   | ENTRY_DENIED CARD_BLOCKED. |
| Local status page | Last check-in result with the reason. |
| Web dashboard | Teacher alert list with snapshots and Ack buttons; blocked cards with an |
|   | Unblock button (Admin); Delete student (Admin) with its audit log. |
| Light and buzzer | Access denied pattern. |
| Database | FACE_MISMATCH, SPOOF, CARD_BLOCKED, ACK and STUDENT_DELETED |
|   | events; private snapshots; no data left for a deleted student. |

Judged live: FACE MISMATCH alert within 10 s; phone photo refused.

## Video must show:

- B tapping A's card until the third mismatch: CARD BLOCKED, even for A; after the Admin unblocks it, Agetsin

- Two Teacher windows pressing Ack on one alert at the same moment: exactly one acknowledgment, naming who and when

- Student C deleted by the Admin: no face data, card link or snapshot of C remains; the audit log shows who deleted C and when

Write-up must show: the anti-spoofing method, the face-match threshold and the lockout rule, with measured results, and what the deletion removes; and a Student cannot open a snapshot's address; the card stays blocked for 5 minutes unless the Admin unblocks it.


## Group 5 — Classroom Vision and Wi-Fi Sensing (130 marks)

## Level 9: Occupancy, Live View, Night Watch and Tamper

Scenario. The camera counts people and seats, shows the room live, guards it at night and knows when it has been covered or moved — without storing pictures of students.

## Tasks

- Camera positions: the Admin saves two positions with a reference snapshot each — DOOR (facing the card reader) and ROOM (facing the seats). The Teacher selects the position; the camera is re- aimed by hand within 1 minute. Check-in works only atDOOR; a card tap at denied with CAMERA NOT AT DOOR.

- Seat zones and occupancy: on the ROOM snapshot the Admin draws at least two seat zones. Every 2 seconds the server counts the people in view (pre-trained person detectors allowed); a zone is Occupied when a person's centre is inside it. Changes hold for 3 seconds and appear on the dashboard (count and seat map) within 6 seconds.

- Live view: the Teacher and Admin dashboards show the camera live at 2 frames per second or more, with a box around each detected person. Students and Guardians cannot open it.

- Capacity: the Admin sets the capacity. When the people count stays above it for 3 seconds, OVER CAPACITY shows on the dashboard and the local status page (an OVER_CAPACITY event).

- Night watch: a Teacher or Admin switches the room to Night mode. In Night mode, a person seen by the camera for 3 seconds raises INTRUDER: an Admin alert with one snapshot within 10 seconds, and INTRUDER on the local status page.

- Frames used for counting or the live view are never stored; the only image kept is the single INTRUDER snapshot (Teacher and Admin only).

- Compare each frame (at least every 2 seconds) with the reference snapshot of the selected position and detect COVERED and MOVED within 6 seconds, using any image-processing method and documented thresholds. Show the measured scores used for the decision live on the dashboard.

- On a fault: Teacher alert within 10 seconds with a snapshot of the fault moment, cyan light on the device, CAMERA FAULT: <state>onthelocalstatus page, and card check-ins denied with CAMERA FAULT.

- Back to OK within 6 seconds after the cause is removed. People walking through the view must not cause a fault.

## Where it must show

| Serial Monitor | [CAM] position=DOOR or position=R0O0M when the Teacher changes |
| --- | --- |
|   | it. [EVENT] CAMERA_FAULT COVERED or MOVED, and [EVENT] |
|   | CAMERA_OK. |
| Local status page | Camera position; people count; OVER CAPACITY; INTRUDER. CAMERA |
|   | FAULT: <state> while it lasts. |
| Web dashboard | Camera position selector, seat map, people count, capacity setting, Night |
|   | mode switch, OVER CAPACITY and INTRUDER alerts, live view with boxes |
|   | (Teacher and Admin only). Camera health with live scores; fault alert with |
|   | snapshot. |
| Light and buzzer | Cyan heartbeat during a fault. |
| Database | OVER_CAPACITY and Camera positions and zones; |
|   | INTRUDER events (counts only; one snapshot per INTRUDER). |
|   | CAMERA_FAULT events with times. |


Judged live: count and seat map right at every step; OVER CAPACITY; at least 20 live-view updates in 10 s; COVERED within 6 s and OK again within 6 s.

## Video must show:

- Night mode, with a person in front of the camera for 5 seconds: an INTRUDER alert with a snapshot reaches the Admin within 10 seconds, and the local page shows INTRUDER

- The camera turned about 45° away: MOVED within 6 seconds, and OK within 6 seconds after turning it back

- A card tapped while the camera is covered at DOOR: denied with CAMERA FAULT; a card tapped at ROOM: denied with CAMERA NOT AT DOOR

Write-up must show: the person-detection model, how zones are decided, the measured counting accuracy, the live-view frame rate and the Night-mode rule; and the camera-health measures, the thresholds and how they were tuned; and counting and live-view frames are not stored (only the INTRUDER snapshot is kept); Students cannot open the live view; people walking through the view cause no camera fault; the camera-health scores are shown live.

40 marks

Scenario. The team trains its own model to notice raised hands and proves how well it works on images it has never seen.

## Level 10: Own-Trained Hand-Raise Detector

## Tasks

- 1. Collect, with the team’s own camera at ROOM, at least 100 images of a raised hand and at least 100 without, and keep at least 20% aside as a held-out set that is never used for training.

- 2. Train the team’s own classifier. Its input may be the seat-zone image or features from a pre-trained model, but the final classifier must be trained by the team; a ready-made hand-raise model is not allowed. The training code is in the repository.

- 3. A Model page shows the image counts, the held-out accuracy, a confusion matrix and the average time per prediction.

- 4. AtROOM, a hand held up for at least 2 seconds in a seat zone shows HAND RAISED — Seat <n> on the Teacher's dashboard within 5 seconds, once per raise. The dashboard also shows today's number of raises per seat.

## Where it must show

| Serial Monitor | Unchanged. |
| --- | --- |
| Local status page | Last hand raised: seat and time. |
| Web dashboard | Model page; HAND RAISED — Seat <n> notifications; raises per seat |
|   | today. |
| Light and buzzer | Unchanged. |
| Database | HAND_RAISED events with seat and time. |

Judged live: at least 3 of 4 live trials correct (two raised hands, two other movements); each raise shown once, on the right seat, within 5 s.

## Video must show:

- \+ The Model page: at least 100 images per class, at least 20% held out, held-out accuracy, confusion matrix and time per prediction


Write-up must show: the dataset, the training method, the held-out accuracy, the confusion matrix and the prediction time; and the training code is in the repository; no ready-made hand-raise model is used.

## Level 11: Wi-Fi CSI Presence and Localization

Scenario. With the camera covered, the Wi-Fi signal alone must show whether the room is empty and where a person is standing.

40 marks

## Tasks

- 1. Capture Wi-Fi channel state information (CSI) on the ESP32-S3 from the access point it is connected to, at least 20 CSI packets per second, and send it — or features computed from it on the device — to the server. The Serial command csi prints the packet rate, the number of subcarriers and the Wi-Fi channel.

- 2. The camera may not be used for any decision in this level; its lens stays covered during the test (the COVERED camera fault from Level 9 is expected).

- 3. The board and the access point (the team’s own hotspot or router) stay in fixed places during data collection and the test.

- 4. Presence: classify the room as EMPTY or OCCUPIED from CSI alone. A new state counts only after holding for 3 seconds, and each change is a PRESENCE event.

- 5. Localization: the judges mark a 2 x 2 grid of zones (about 1 m each) on the floor at the team's station before the clock starts. Collect your own labelled CSI samples in each zone and with the grid empty, keep at least 20% aside as a held-out set that is never used for training, and train a model that predicts which zone one person is standing in.

- 6. Show a live 2D room map on the dashboard with the occupied zone highlighted, updating within 3 seconds of each prediction. The Model page also shows the CSI dataset (samples per zone and empty), the held-out accuracy and a confusion matrix.

## Where it must show

| Serial Monitor | Reply to csi (packet rate, subcarriers, channel); [EVENT] PRESENCE |
| --- | --- |
|   | EMPTY or OCCUPIED when received. |
| Local status page | Presence (EMPTY or OCCUPIED) and the predicted zone. |
| Web dashboard | Live 2D room map with the predicted zone highlighted; presence state; CSI |
|   | section of the Model page. |
| Light and buzzer | Unchanged (cyan camera fault while the lens is covered). |
| Database | Labelled CSI samples; PRESENCE events; zone predictions with their times. |

Judged live: EMPTY and OCCUPIED within 5 s; at least 3 of 4 zones correct with a judge standing in them; map within 3 s.

## Video must show:

- The csi command showing at least 20 CSI packets per second, and the Model page with samples per zone and empty, held-out accuracy and confusion matrix

Write-up must show: the CSI dataset (samples per zone and empty), the features and model, the held- out accuracy and confusion matrix, and the measured presence delay; and the camera is not used for any decision; at least 20% of the CSI samples are held out.


## Group 6 — Resilience (50 marks)

## Level 12: Offline, Bluetooth and Power-Cut Recovery

Scenario. When the Wi-Fi drops and the power fails, students must still get in, the device must stay visible, and nothing may be lost or sent twice.

50 marks

## Tasks

- Li Show the connection state on the Serial Monitor, the local page and the dashboard: LIVE, OFFLINE, SYNCING, LIVE; the light shows the blue heartbeat while offline (unless a higher-priority state applies).

- Offline entry: while online, the device keeps in flash the card UIDs of the class running now. While offline, those cards are admitted by card alone and recorded as OFFLINE_ENTRY (face not verified); no other card or tag opens the door.

- Stay reachable: when the Wi-Fi has been down for 30 seconds, the device also starts its access point (SmartClass-<TeamID>, same password) so that the local status page stays reachable; the page shows the number of records waiting to be sent.

- 4. Bluetooth LE beacon: while offline, the device advertises over Bluetooth LE with the name SC- <TeamID>-<STATE> (for example SC-TO7-OFFLINE, SC-T@7-FIRE), visible in any BLE scanner app.

- 5. While offline, every reading and event is saved in flash (at least 30 minutes of telemetry), survives a power cut, and is sent oldest first when the connection returns — each record once, with its original time. A record half-written by a power cut is discarded. Attendance from an offline entry uses the time of the tap.

- 6. The door state, fire state, settings, Room ID and Teacher tag list are restored after every restart.

## Where it must show

| Serial Monitor | [NET] OFFLINE, [NET] SYNCING n=<records>, [NET] LIVE; |
| --- | --- |
|   | [NET] AP ON; [EVENT] OFFLINE_ENTRY; [BLE] advertising |
|   | <name>. |
| Local status page | Connection state and the number of records waiting; reachable through the |
|   | device's own access point while offline. |
| Web dashboard | Connection state; offline entries flagged face-not-verified. |
| Light and buzzer | Blue heartbeat while offline; access granted pattern for offline entries. |
| Database | All outage records once each, with their original times; OFFLINE_ENTRY |
|   | events. |
| Bluetooth LE | SC-<TeamID>-<STATE> (for example while offline. |

Judged live: own access point and Bluetooth name while offline; card-only entry for today's class; records sent once with their original times.

## Video must show:

- The board switched off for 10 seconds during an outage: it keeps working offline, the waiting-records count is kept, and the records from before the cut are later sent once with their original times

- The device put in a non-default state (for example the fire state latched) and the power cut twice in a row: after each restart the light, local page, door and dashboard agree within 20 seconds


Write-up must show: the offline buffer, how duplicates are prevented, how the original time is kept after a restart, and the Bluetooth advertising; and at least 30 minutes of telemetry can be buffered; a half-written record is discarded.

## 9. Scoring Summary

A level passed on the 2nd attempt scores 70% of its marks. A level counts only when it is passed live and its evidence is uploaded.

| Gr | Level | Name |   | Marks |
| --- | --- | --- | --- |
| 1. Device Foundation | 1 | Dual-Core Tasks, Health and Watchdog | 35 |
| 1. Device Foundation | 2 | Wi-Fi Setup and Secure Telemetry | 45 |
| 2. Classroom Safety | 3 | Heat, Fire, Panic and Fail-Safe Door | 50 |
| 3. Platform and Control | 4 | Secure Platform, Roles and Alerts | 40 |
| 3. Platform and Control | 5 | Remote Settings, OTA and Rollback | 30 |
| 3. Platform and Control | 6 | Weather, History and Al Assistant | 40 |
| 4. Card and Face Access | 7 | Card and Face Check-In | 50 |
| 4. Card and Face Access | 8 | Spoofing, Lockout and Data Deletion | 30 |
| 5. Classroom Vision and Wi-Fi | 9 | Occupancy, Live View, Night Watch and | 50 |
| Sensing |   | Tamper |   |
| 5. Classroom Vision and Wi-Fi | 10 |   | Own-Trained Hand-Raise Detector | 40 |
| Sensing |   |   |   |
| 5. Classroom Vision and Wi-Fi | 11 |   | Wi-Fi CSI Presence and Localization | 40 |
| Sensing |   |   |   |
| 6. Resilience | 12 | Offline, Bluetooth and Power-Cut Recovery | 50 |
|   |   | Total | 500 |
