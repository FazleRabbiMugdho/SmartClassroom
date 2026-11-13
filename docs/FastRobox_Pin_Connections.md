# FastRobox 1.0 — Pin Connections and Verification Status

Status key: **VERIFIED** = supported by reliable documentation; **SIMULATED** = tested in a simulator; **UNVERIFIED** = cannot be confirmed yet. No physical test has been performed.

## 1. Kit identification (from user photos, 13 Nov 2026)

| Part | Identification | Status |
|---|---|---|
| Microcontroller | ESP32-S3-WROOM CAM board, module `ESP-32-S3-N16R8` (16 MB flash, 8 MB PSRAM), OV3660 camera on flex cable, back silk `USB-UART` / `USB-OTG`, SD slot on back | Board maker UNVERIFIED |
| USB-serial chip | Back photo reads `CH343P`. Windows Device Manager shows `USB-Enhanced-SERIAL CH343 (COM3)` | VERIFIED on the user's PC |
| RC522 | Blue `RFID-RC522`, board marked `HW-126`, 8-pin header | Pin order from silk UNVERIFIED (continuity check needed) |
| DHT11 | Blue 3-pin breakout, red power LED, header silk `GND`, `DATA`, `VCC` (top to bottom) | Silk read; pull-up on module assumed UNVERIFIED |
| Flame sensor | Blue 3-pin IR module, LM393 comparator (low confidence), trimmer `3362`, silk `DO GND VCC` | Pin order from silk; output polarity UNVERIFIED |
| Buzzer | Black cylinder, `+` mark on top, no rating visible | Active/passive, rating UNVERIFIED |
| Card and key tag | White card marked "60", blue key tag marked "22" | UIDs UNVERIFIED |

## 2. ESP32-S3 header labels (from user photos)

- **Left header (top to bottom):** 3V3, EN, 4, 5, 6, 7, 15, 16, 17, 18, 8, 3, 46, 9, 10, 11, 12, 13, 14, 5V
- **Right header (top to bottom):** TX, RX, 1, 2, 42, 41, 40, 39, 38, 37, 36, 35, 0, 45, 48, 47, 21, 20, 19, GND
- **Onboard RGB LED:** silk "48" beside the 4th LED. Probably GPIO48, UNVERIFIED until a test sketch confirms it.

GPIO reserved or avoided:
- GPIO35–37: octal PSRAM on N16R8 modules
- GPIO0, 3, 45, 46: strapping pins
- GPIO19, 20: native USB D-/D+
- GPIO43, 44: UART0 (TX/RX) used by the CH343 bridge
- GPIO39–42: JTAG by default (used here as GPIO, JTAG not needed)
- GPIO14: on the header, not in any camera map found; left unused

## 3. Pin connection table (proposed)

Power and ground use the 3V3 and GND pins; one 3V3 and one GND pin may need to be shared through a jumper daisy-chain (no breadboard allowed).

| Wire No. | From (Component → Actual Printed Pin Label) | To (Component → Actual Printed Pin Label) | Status |
|---|---|---|---|
| 1 | RC522 → 3.3V | ESP32-S3 → 3V3 | UNVERIFIED |
| 2 | RC522 → GND | ESP32-S3 → GND | UNVERIFIED |
| 3 | RC522 → RST | ESP32-S3 → GPIO38 (label "38") | UNVERIFIED |
| 4 | RC522 → MISO | ESP32-S3 → GPIO21 (label "21") | UNVERIFIED |
| 5 | RC522 → MOSI | ESP32-S3 → GPIO47 (label "47") | UNVERIFIED |
| 6 | RC522 → SCK | ESP32-S3 → GPIO41 (label "41") | UNVERIFIED |
| 7 | RC522 → SDA | ESP32-S3 → GPIO42 (label "42") | UNVERIFIED |
| 8 | DHT11 → VCC | ESP32-S3 → 3V3 | UNVERIFIED |
| 9 | DHT11 → GND | ESP32-S3 → GND | UNVERIFIED |
| 10 | DHT11 → DATA | ESP32-S3 → GPIO39 (label "39") | UNVERIFIED |
| 11 | Flame sensor → VCC | ESP32-S3 → 3V3 | UNVERIFIED |
| 12 | Flame sensor → GND | ESP32-S3 → GND | UNVERIFIED |
| 13 | Flame sensor → DO | ESP32-S3 → GPIO40 (label "40") | UNVERIFIED |
| 14 | Buzzer → + | ESP32-S3 → GPIO2 (label "2") | UNVERIFIED |
| 15 | Buzzer → − | ESP32-S3 → GND | UNVERIFIED |
| 16 | Touch pad (bare jumper wire end) | ESP32-S3 → GPIO1 (label "1") | UNVERIFIED |

## 4. Camera connections (proposed common map, UNVERIFIED)

Camera ribbon is internal to the board (flex cable from OV3660 to the camera connector). These GPIOs are the signals the firmware must use; they are not external wires.

| Camera signal | GPIO | Source |
|---|---|---|
| XCLK | 15 | Common map (newbiely; GitHub ESP32S3-CAM; MB0200) |
| SIOD (SDA) | 4 | Same |
| SIOC (SCL) | 5 | Same |
| VSYNC | 6 | Same |
| HREF | 7 | Same |
| PCLK | 13 | Same |
| Y2 / Y3 / Y4 / Y5 | 11 / 9 / 8 / 10 | MB0200 page; GitHub map |
| Y6 / Y7 / Y8 / Y9 | 12 / 18 / 17 / 16 | Same |
| PWDN / RESET | not found | UNVERIFIED |

Camera is not simulated in Wokwi. It must be checked on the real board with a camera sketch.

## 5. Sources consulted

- [Keyestudio MB0200 S3 CAM](https://docs.keyestudio.com/projects/MB0200/en/latest/docs/MB0200%20S3%20CAM.html) — camera map; board is CH340C, so may not be this board
- [newbiely ESP32-S3 camera tutorial](https://newbiely.com/tutorials/esp32-s3/esp32-s3-camera) — XCLK 15
- [Kewl RC522 wiki](https://wiki.kewl.org/interfaces:rc522) — RC522 pin functions
- [ShillehTek RC522 manual](https://shillehtek.com/blogs/shillehtek-product-manuals/rc522-rfid-reader-writer-module-13-56mhz-kit-for-arduino-manual)
- [ShillehTek DHT11 manual](https://shillehtek.com/blogs/shillehtek-product-manuals/dht11-temperature-humidity-sensor-module-manual)
- [ShillehTek flame sensor manual](https://shillehtek.com/blogs/shillehtek-product-manuals/flame-sensor-ky-026-arduino-esp32-raspberry-pi-manual)
- [Waveshare flame sensor manual](https://files.waveshare.com/upload/4/44/Flame-Sensor-UserManual.pdf)
- [Lonely Binary active buzzer](https://lonelybinary.com/blogs/tutorial/active-buzzer)
- [YD-ESP32-S3 project (CH343P)](https://github.com/rtek1000/YD-ESP32-23) — CH343P board, not a camera board
- [AliExpress N16R8 pinout article](https://www.aliexpress.us/s/wiki-ssr/article/esp32-s3-n16r8-pinout-diagram) — conflicting camera map; not trusted

## 6. Open items before wiring

1. Confirm the board's camera map with a camera test sketch on the real board.
2. Continuity-check the RC522 pin order.
3. Confirm the flame sensor output polarity with a safe test (judges' candle only).
4. Check the buzzer's rating and polarity before driving it from a GPIO.
5. Confirm the onboard RGB LED GPIO (48) with a test sketch.
6. Confirm the board maker and model (not MB0200 unless the chip matches).
