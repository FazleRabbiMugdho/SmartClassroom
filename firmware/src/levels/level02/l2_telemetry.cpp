// Level 2 — secure telemetry: one JSON record every 5 s plus events sent at once, over HTTPS with the
// server certificate checked against the ESP32 root certificate bundle. The device token comes from
// the setup page (flash), never from the code.
// Also offers level02Request() so later levels can talk to the platform with the same token.
#include <Arduino.h>
#include "core/tasks.h"
#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <esp_task_wdt.h>
#include <time.h>
#include "core/shared.h"
#include "levels/level02.h"
#include "levels/level02/l2.h"

// Root certificates bundled with the Arduino ESP32 core.
extern const uint8_t rootca_crt_bundle_start[] asm("_binary_x509_crt_bundle_start");

struct PendingEvent {
  char type[24];
  char detail[96];
  uint32_t seq;
  uint32_t mono_ms;      // millis() when it happened; turned into a UTC time when it is sent
};
static QueueHandle_t g_evq = nullptr;
static SemaphoreHandle_t g_http_mutex = nullptr;   // one HTTPS request at a time (TLS needs memory)
static uint32_t g_last_ok_ms = 0;

static const uint32_t TELEMETRY_PERIOD_MS = 5000;     // paper: every 5 +/- 1 s
static const uint32_t LIVE_WINDOW_MS = 15000;          // LIVE while the server answered recently

static bool timeValid() { return time(nullptr) > 1700000000; }

// UTC seconds for something that happened "age_ms" ago.
static uint32_t tsFromAge(uint32_t age_ms) { return (uint32_t)time(nullptr) - age_ms / 1000; }

void l2OnEvent(const char *type, const char *detail) {
  if (!g_evq) return;
  PendingEvent e;
  strncpy(e.type, type, sizeof(e.type) - 1); e.type[sizeof(e.type) - 1] = 0;
  strncpy(e.detail, detail, sizeof(e.detail) - 1); e.detail[sizeof(e.detail) - 1] = 0;
  e.seq = l2NextSeq();
  e.mono_ms = millis();
  if (xQueueSend(g_evq, &e, 0) != pdTRUE) {          // queue full: drop the oldest, keep the newest
    PendingEvent drop;
    xQueueReceive(g_evq, &drop, 0);
    xQueueSend(g_evq, &e, 0);
  }
}

static String jsonEscape(const char *s) {
  String o;
  for (; *s; s++) {
    if (*s == '"' || *s == '\\') { o += '\\'; o += *s; }
    else if ((uint8_t)*s >= 32) o += *s;
  }
  return o;
}

// One HTTPS request to the platform. Returns the HTTP status, or 0 when it could not be sent.
static int httpsRequest(const char *method, const char *path, const String &body, String *response) {
  if (!g_l2.server[0] || !g_l2.token[0]) return 0;
  String url = String(g_l2.server) + path;
  if (!url.startsWith("https://")) {
    Serial.println("[ERROR] server URL must start with https://");
    return 0;
  }
  if (xSemaphoreTake(g_http_mutex, pdMS_TO_TICKS(8000)) != pdTRUE) return 0;
  int code = 0;
  {
    WiFiClientSecure client;
    client.setCACertBundle(rootca_crt_bundle_start);   // the server certificate is checked
    client.setTimeout(4);
    HTTPClient http;
    http.setTimeout(4000);
    if (http.begin(client, url)) {
      http.addHeader("Content-Type", "application/json");
      http.addHeader("Authorization", String("Bearer ") + g_l2.token);
      code = (strcmp(method, "GET") == 0) ? http.GET() : http.POST(body);
      if (response && code > 0) *response = http.getString();
      http.end();
    }
  }
  xSemaphoreGive(g_http_mutex);
  esp_task_wdt_reset();
  return code > 0 ? code : 0;
}

int level02Request(const char *method, const char *path, const String &body, String *response) {
  if (!g_http_mutex || WiFi.status() != WL_CONNECTED || !timeValid()) return 0;
  return httpsRequest(method, path, body, response);
}

// POST a JSON body. Returns true when the platform accepted it (200/201) or already had it (409).
static bool postJson(const char *path, const String &body) {
  int code = httpsRequest("POST", path, body, nullptr);
  if (code == 200 || code == 201 || code == 409) return true;
  if (code != 0) Serial.printf("[NET] server answered %d\n", code);
  return false;
}

static void setConn(const char *s) { STATE_LOCK(); g_state.conn_state = s; STATE_UNLOCK(); }

static String buildTelemetry() {
  float t, h, hi, chip = temperatureRead(); bool flame, door, bad, rbad; uint32_t read_ms; int rssi; bool rssi_ok;
  char room[32], status[8], trend[8];
  STATE_LOCK();
  t = g_state.tempC; h = g_state.rh; flame = g_state.flame; door = g_state.door_unlocked;
  bad = g_state.dht_error || g_state.rfid_error; read_ms = g_state.dht_read_ms;
  rssi = g_state.rssi; rssi_ok = g_state.rssi_valid;
  hi = g_state.heat_index_c; rbad = g_state.reading_bad;
  strcpy(status, g_state.status); strcpy(trend, g_state.heat_trend);
  strncpy(room, g_state.room_id, sizeof(room)); room[sizeof(room) - 1] = 0;
  STATE_UNLOCK();
  if (isnan(t) || isnan(h) || rbad) bad = true;
  if (strcmp(trend, "-") == 0) strcpy(trend, "STABLE");     // before Level 3 has enough readings
  uint32_t age = read_ms ? (millis() - read_ms) : 0;          // ts = when the reading was taken
  String j = "{";
  j += "\"device_id\":\"" + l2DeviceId() + "\",";
  j += "\"room_id\":\"" + jsonEscape(room) + "\",";
  j += "\"seq\":" + String(l2NextSeq()) + ",";
  j += "\"ts\":" + String(tsFromAge(age)) + ",";
  j += "\"uptime_s\":" + String((millis() - g_state.boot_ms) / 1000) + ",";
  j += "\"temp_c\":" + (isnan(t) ? String("null") : String(t, 1)) + ",";
  j += "\"rh\":" + (isnan(h) ? String("null") : String((int)h)) + ",";
  j += "\"heat_index_c\":" + (isnan(hi) ? String("null") : String(hi, 1)) + ",";
  j += "\"flame\":" + String(flame ? "true" : "false") + ",";
  j += "\"door\":\"" + String(door ? "UNLOCKED" : "LOCKED") + "\",";
  j += "\"status\":\"" + String(status) + "\",";
  j += "\"heat_trend\":\"" + String(trend) + "\",";
  j += "\"rssi\":" + (rssi_ok ? String(rssi) : String("null")) + ",";
  j += "\"heap_kb\":" + String(ESP.getFreeHeap() / 1024) + ",";
  j += "\"chip_temp_c\":" + String(chip, 1) + ",";
  j += "\"fw\":\"" + String(FW_VERSION) + "\",";
  j += "\"quality\":\"" + String(bad ? "bad" : "good") + "\"}";
  return j;
}

static void telemetryTask(void *) {
  esp_task_wdt_add(nullptr);
  uint32_t last_tel = 0;
  for (;;) {
    esp_task_wdt_reset();
    bool online = (WiFi.status() == WL_CONNECTED) && timeValid() && strcmp(l2NetMode(), "STATION") == 0;
    if (online && g_l2.server[0]) {
      // Events first, oldest first, each sent at once.
      PendingEvent e;
      while (xQueuePeek(g_evq, &e, 0) == pdTRUE) {
        String j = "{\"device_id\":\"" + l2DeviceId() + "\",\"room_id\":\"" + jsonEscape(g_l2.room) +
                   "\",\"seq\":" + String(e.seq) + ",\"ts\":" + String(tsFromAge(millis() - e.mono_ms)) +
                   ",\"type\":\"" + e.type + "\",\"detail\":\"" + jsonEscape(e.detail) + "\"}";
        if (!postJson("/api/ingest/event", j)) { setConn("OFFLINE"); break; }
        xQueueReceive(g_evq, &e, 0);
        g_last_ok_ms = millis();
        setConn("LIVE");
        esp_task_wdt_reset();
      }
      if (millis() - last_tel >= TELEMETRY_PERIOD_MS) {
        last_tel = millis();
        if (postJson("/api/ingest/telemetry", buildTelemetry())) {
          g_last_ok_ms = millis();
          setConn("LIVE");
        }
      }
      if (g_last_ok_ms == 0 || millis() - g_last_ok_ms > LIVE_WINDOW_MS) setConn("OFFLINE");
    }
    vTaskDelay(pdMS_TO_TICKS(100));
  }
}

void l2TelemetryStart() {
  g_evq = xQueueCreate(16, sizeof(PendingEvent));
  g_http_mutex = xSemaphoreCreateMutex();
  coreTaskCreate(telemetryTask, "l2tel", 10240, nullptr, 1, nullptr, 0);
}
