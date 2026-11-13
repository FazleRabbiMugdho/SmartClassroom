// Shared state used by every level. Levels write their results here; the console reads them.
// Keep this file small: a field is added here only when two or more levels need it.
#pragma once
#include <Arduino.h>

constexpr const char *FW_VERSION = "1.0.0";
constexpr const char *BUILD_DATE = __DATE__ " " __TIME__;

struct SharedState {
  // Level 1 sensors
  float tempC = NAN;
  float rh = NAN;
  bool flame = false;
  bool dht_error = false;
  bool rfid_error = false;
  char last_uid[32] = "-";
  // Door (Level 1 sets it at start-up; Level 3+ changes it)
  bool door_unlocked = false;
  // Boot info
  uint32_t boot_ms = 0;
  const char *reset_reason = "POWER_ON";
  // --- added by Level 2 (additive; Level 1 fields above are unchanged) ---
  uint32_t dht_read_ms = 0;          // millis() when the last good DHT reading was taken
  bool rssi_valid = false;           // true while connected to Wi-Fi
  int rssi = 0;                      // dBm
  const char *conn_state = "OFFLINE";// SETUP, CONNECTING, OFFLINE, LIVE (Level 12 adds SYNCING)
  char room_id[32] = "-";
  char ip[20] = "-";
  // --- added by Level 3 (additive; fields above are unchanged) ---
  char status[8] = "SAFE";          // SAFE, WARNING, DANGER or FIRE
  float heat_index_c = NAN;
  char heat_trend[8] = "-";         // "-" until Level 3 has readings; then RISING, STABLE or FALLING
  bool reading_bad = false;         // a failed or impossible DHT reading: quality is "bad"
  bool fire_active = false;         // fire latch: later levels must keep the door UNLOCKED while true
  bool fire_silenced = false;
  bool panic_active = false;
};

extern SharedState g_state;
extern portMUX_TYPE g_state_mux;

// Helpers for locking the shared state from any task.
#define STATE_LOCK() portENTER_CRITICAL(&g_state_mux)
#define STATE_UNLOCK() portEXIT_CRITICAL(&g_state_mux)
