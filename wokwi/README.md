# FastRobox 1.0 — Wokwi circuit project

Editable simulator project for the wiring in [../docs/FastRobox_Pin_Connections.md](../docs/FastRobox_Pin_Connections.md).

| File | Purpose |
|---|---|
| `diagram.json` | Wokwi circuit (open in the Wokwi VS Code extension or paste into wokwi.com) |
| `wokwi.toml` | Points Wokwi at the firmware build (`.pio/build/esp32s3/firmware.bin`, built in the firmware step) |
| `preview.svg` | Wiring preview, generated from `diagram.json` |

## Open it

1. Install the Wokwi extension for VS Code, open this folder, run **Wokwi: Start Simulator** (needs a built firmware), or
2. Create an ESP32-S3 project on wokwi.com and paste `diagram.json` into the editor.

Part positions are approximate; drag parts in the editor if wires overlap. Wire routing is left automatic.

## What the simulator can and cannot represent

| Real part | In Wokwi | Status |
|---|---|---|
| ESP32-S3-WROOM CAM N16R8 | `board-esp32-s3-devkitc-1` (generic DevKitC-1; no camera, different header layout) | Pin names are bare GPIO numbers per Wokwi's board file |
| RC522 | `board-mfrc522` | Pin names read from Wokwi docs (`3.3V RST GND IRQ MISO MOSI SCK SDA`) |
| DHT11 module | `wokwi-dht22` (stand-in; DHT11 not documented) | Firmware must use the library Wokwi recommends |
| IR flame sensor | none exists; `wokwi-pushbutton` stand-in for DO and GND only | VCC wire (table row 11) not represented |
| Active buzzer | `wokwi-buzzer` (pin `2` = +, pin `1` = −) | Rating of the real buzzer UNVERIFIED |
| Touch pad (GPIO1, bare wire) | not represented | Whether Wokwi simulates `touchRead` is UNVERIFIED |
| OV3660 camera | not represented | Camera map UNVERIFIED |

In Wokwi the DevKitC-1 has two `3V3` and four `GND` pins. The real board may have only one of each, so the diagram uses `3V3.1` and `GND.1` for every shared wire, matching the spliced-joint plan.

## Wire check

`diagram.json` has 14 wires. They were compared automatically against the pin table in the docs: all 14 table rows that the simulator can represent match; rows 11 (flame VCC) and 16 (touch pad) are intentionally absent. Result: **SIMULATED/structural check only** — the circuit has not been run in Wokwi (no firmware yet) and nothing has been tested on the real board.

## Next

- Firmware step: produce the PlatformIO project that creates `.pio/build/esp32s3/firmware.bin`.
- If a board-accurate schematic with every part (flame sensor, touch pad, camera) is needed, add a KiCad project with custom symbols.
