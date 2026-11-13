// Level 2 — Wi-Fi manager: setup access point, station connection, reconnect with growing gaps,
// mDNS, NTP, BOOT-button reset. Runs in its own task, so Level 1 is never blocked.
#include <Arduino.h>
#include "core/tasks.h"
#include <WiFi.h>
#include <ESPmDNS.h>
#include <esp_task_wdt.h>
#include <time.h>
#include "pins.h"
#include "core/shared.h"
#include "core/light.h"
#include "levels/level02/l2.h"

enum NetState { NS_SETUP, NS_CONNECTING, NS_CONNECTED, NS_WAIT_RETRY };
static volatile NetState g_ns = NS_SETUP;
static String g_setup_error = "";
static char g_ap_pass[9] = "";
static uint32_t g_attempt_start = 0, g_retry_at = 0;
static uint8_t g_retry_idx = 0;
static volatile bool g_apply_requested = false;
static bool g_ap_up = false;

static const uint32_t CONNECT_TIMEOUT_MS = 12000;   // under the 15 s limit for returning to setup
static const uint32_t RETRY_GAPS_MS[] = {1000, 2000, 4000, 8000, 15000, 30000};

const char *l2NetMode() { return (g_ns == NS_SETUP) ? "SETUP" : "STATION"; }
String l2SetupError() { return g_setup_error; }

String l2LocalTime() {
  time_t now = time(nullptr);
  if (now < 1700000000) return "--:--:--";
  struct tm t;
  localtime_r(&now, &t);
  char buf[24];
  snprintf(buf, sizeof(buf), "%04d-%02d-%02d %02d:%02d:%02d", t.tm_year + 1900, t.tm_mon + 1, t.tm_mday,
           t.tm_hour, t.tm_min, t.tm_sec);
  return String(buf);
}

static void setConn(const char *s) {
  STATE_LOCK(); g_state.conn_state = s; STATE_UNLOCK();
}

static void makeApPassword() {
  if (g_ap_pass[0]) return;
  const char *alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  size_t n = strlen(alphabet);
  for (int i = 0; i < 8; i++) g_ap_pass[i] = alphabet[esp_random() % n];
  g_ap_pass[8] = 0;
}

static void startAp() {
  makeApPassword();
  if (!g_ap_up) {
    WiFi.softAP(l2ApSsid().c_str(), g_ap_pass);
    g_ap_up = true;
    Serial.printf("[NET] AP ON ssid=%s password=%s ip=192.168.4.1\n", l2ApSsid().c_str(), g_ap_pass);
  }
}

static void enterSetup(const String &error) {
  g_setup_error = error;
  WiFi.disconnect(false);
  WiFi.mode(WIFI_AP_STA);
  startAp();
  g_ns = NS_SETUP;
  lightSet(LS_WIFI_SETUP, true);
  setConn("SETUP");
  STATE_LOCK();
  strcpy(g_state.ip, "192.168.4.1");
  g_state.rssi_valid = false;
  STATE_UNLOCK();
  Serial.printf("[NET] SETUP MODE%s%s\n", error.length() ? " error: " : "", error.c_str());
}

// Prints the exact reason the Wi-Fi link dropped, so a failed join is easy to diagnose.
// Common codes: 15 or 204 = wrong password (handshake), 201 = network not found, 202 = auth failed.
static const char *disconnectName(uint8_t r) {
  switch (r) {
    case 2: return "AUTH_EXPIRE";
    case 4: return "ASSOC_EXPIRE";
    case 15: return "4WAY_HANDSHAKE_TIMEOUT (usually wrong password)";
    case 201: return "NO_AP_FOUND (network not seen, or not 2.4 GHz)";
    case 202: return "AUTH_FAIL (wrong password)";
    case 203: return "ASSOC_FAIL";
    case 204: return "HANDSHAKE_TIMEOUT (usually wrong password)";
    case 205: return "CONNECTION_FAIL";
    default: return "other";
  }
}

static void onWifiEvent(arduino_event_id_t event, arduino_event_info_t info) {
  if (event == ARDUINO_EVENT_WIFI_STA_DISCONNECTED) {
    uint8_t r = info.wifi_sta_disconnected.reason;
    Serial.printf("[NET] disconnect reason=%u (%s)\n", r, disconnectName(r));
  }
}

static bool g_wifi_event_added = false;

static void startConnect() {
  Serial.printf("[NET] connecting to \"%s\" (password length %u)\n", g_l2.ssid, (unsigned)strlen(g_l2.pass));
  if (!g_wifi_event_added) { WiFi.onEvent(onWifiEvent); g_wifi_event_added = true; }
  WiFi.mode(g_ap_up ? WIFI_AP_STA : WIFI_STA);
  WiFi.setAutoReconnect(false);          // this manager owns the retry gaps
  WiFi.begin(g_l2.ssid, g_l2.pass);
  g_attempt_start = millis();
  g_ns = NS_CONNECTING;
  setConn("CONNECTING");
}

static void onConnected() {
  String ip = WiFi.localIP().toString();
  Serial.printf("[NET] connected ip=%s\n", ip.c_str());
  if (MDNS.begin(l2MdnsName().c_str())) {
    MDNS.addService("http", "tcp", 80);
    Serial.printf("[NET] mDNS name=%s.local\n", l2MdnsName().c_str());
  }
  configTzTime("<+06>-6", "pool.ntp.org", "time.google.com", "time.cloudflare.com");   // Asia/Dhaka
  if (!g_l2.verified) { g_l2.verified = true; l2StoreSave(); }
  if (g_ap_up) { WiFi.softAPdisconnect(true); g_ap_up = false; }
  g_setup_error = "";
  g_retry_idx = 0;
  g_ns = NS_CONNECTED;
  lightSet(LS_WIFI_SETUP, false);
  STATE_LOCK();
  strncpy(g_state.ip, ip.c_str(), sizeof(g_state.ip) - 1);
  strncpy(g_state.room_id, g_l2.room, sizeof(g_state.room_id) - 1);
  STATE_UNLOCK();
  setConn("OFFLINE");                     // becomes LIVE when the server answers (telemetry task)
}

void l2ResetAndRestart() {
  Serial.println("[NET] clearing saved Wi-Fi details; restarting in setup mode");
  l2StoreClear();
  delay(200);
  esp_restart();
}

void l2NetApplySettings() { g_apply_requested = true; }

static void netTask(void *) {
  esp_task_wdt_add(nullptr);
  pinMode(PIN_BOOT, INPUT_PULLUP);
  uint32_t boot_down_since = 0, last_rssi = 0;

  if (g_l2.ssid[0]) startConnect();
  else enterSetup("");

  for (;;) {
    esp_task_wdt_reset();
    uint32_t now = millis();

    // BOOT button held for 5 seconds clears the saved details.
    if (digitalRead(PIN_BOOT) == LOW) {
      if (!boot_down_since) boot_down_since = now;
      if (now - boot_down_since >= 5000) { Serial.println("[NET] BOOT held 5 s"); l2ResetAndRestart(); }
    } else {
      boot_down_since = 0;
    }

    if (g_apply_requested) {                // new details arrived from the setup page
      g_apply_requested = false;
      g_l2.verified = false;
      g_setup_error = "";
      startConnect();
      // startConnect() stamps g_attempt_start AFTER "now" was read. Without this refresh,
      // now - g_attempt_start wraps to a huge number and the attempt "times out" at once
      // (every Save from the setup page failed with status=6 within a second).
      now = millis();
    }

    switch (g_ns) {
      case NS_CONNECTING: {
        wl_status_t st = WiFi.status();
        if (st == WL_CONNECTED) {
          onConnected();
        } else if (st == WL_CONNECT_FAILED || now - g_attempt_start > CONNECT_TIMEOUT_MS) {
          Serial.printf("[NET] connect failed (status=%d)\n", (int)st);
          if (!g_l2.verified) {
            enterSetup(String("Could not connect to \"") + g_l2.ssid + "\" (wrong password or network unreachable)");
          } else {
            uint32_t gap = RETRY_GAPS_MS[min<uint8_t>(g_retry_idx, 5)];
            g_retry_idx++;
            g_retry_at = now + gap;
            g_ns = NS_WAIT_RETRY;
            setConn("OFFLINE");
            Serial.printf("[NET] retry in %lu ms\n", (unsigned long)gap);
          }
        }
        break;
      }
      case NS_CONNECTED:
        if (WiFi.status() != WL_CONNECTED) {
          Serial.println("[NET] disconnected");
          STATE_LOCK(); g_state.rssi_valid = false; STATE_UNLOCK();
          setConn("OFFLINE");
          g_retry_at = now + RETRY_GAPS_MS[0];
          g_retry_idx = 1;
          g_ns = NS_WAIT_RETRY;
        }
        // Signal strength (WiFi.RSSI) is NOT read here: on this board the call stalled the Wi-Fi stack and
        // caused an interrupt watchdog reset (decoded backtrace: netTask -> WiFi.RSSI). The page shows "-" for now.
        break;
      case NS_WAIT_RETRY:
        if ((int32_t)(now - g_retry_at) >= 0) {
          WiFi.disconnect(false);
          startConnect();
        }
        break;
      case NS_SETUP:
        break;
    }
    vTaskDelay(pdMS_TO_TICKS(100));
  }
}

void l2NetStart() {
  WiFi.persistent(false);                  // credentials live in our own NVS keys
  WiFi.mode(WIFI_AP_STA);                  // initialize netif and tcpip stack before sockets start
  coreTaskCreate(netTask, "l2net", 6144, nullptr, 1, nullptr, 0);
}
