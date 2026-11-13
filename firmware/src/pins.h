// FastRobox 1.0 — GPIO assignments.
// Must match docs/FastRobox_Pin_Connections.md (section 3) and wokwi/diagram.json.
// Status: UNVERIFIED on the real board. Camera pins are NOT used in this file yet.
#pragma once

// RC522 RFID reader (SPI)
constexpr int PIN_RC522_SS   = 42;   // RC522 SDA (chip select)
constexpr int PIN_RC522_SCK  = 41;
constexpr int PIN_RC522_MOSI = 47;
constexpr int PIN_RC522_MISO = 21;
constexpr int PIN_RC522_RST  = 38;

// DHT11 temperature and humidity
constexpr int PIN_DHT_DATA   = 39;

// IR flame sensor (digital output DO)
constexpr int PIN_FLAME_DO   = 40;

// Active buzzer
constexpr int PIN_BUZZER     = 2;

// Touch panic pad (bare jumper wire on this pin)
constexpr int PIN_TOUCH_PAD  = 1;

// Onboard RGB LED (WS2812-style) and BOOT button
constexpr int PIN_RGB_LED    = 48;
constexpr int PIN_BOOT       = 0;
