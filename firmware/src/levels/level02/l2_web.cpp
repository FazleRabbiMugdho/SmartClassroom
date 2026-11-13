// Level 2 — local web server: status page and setup page.
// The pages are built into the firmware (web_pages.h, generated from firmware/data/ by tools/embed_pages.py),
// so no separate filesystem upload is needed.
#include <Arduino.h>
#include "core/tasks.h"
#include <WiFi.h>
#include <WebServer.h>
#include <esp_task_wdt.h>
#include "core/shared.h"
#include "core/extras.h"
#include "levels/level02/l2.h"
#include "levels/level02/web_pages.h"

static WebServer server(80);
static String g_scan_cache = "[]";
static bool g_scan_running = false;

static String jsonEscape(const String &s) {
  String o;
  for (size_t i = 0; i < s.length(); i++) {
    char c = s[i];
    if (c == '"' || c == '\\') { o += '\\'; o += c; }
    else if (c == '\n') o += "\\n";
    else if ((uint8_t)c >= 32) o += c;
  }
  return o;
}

static void sendPage(const char *html) {
  server.sendHeader("Cache-Control", "no-store");
  server.send_P(200, "text/html; charset=utf-8", html);
}

static void handleStatus() {
  float t, h; bool flame, door, dhterr, rfiderr, rssi_ok, rbad; int rssi;
  char uid[32], room[32], ip[20], status[8]; const char *conn;
  STATE_LOCK();
  t = g_state.tempC; h = g_state.rh; flame = g_state.flame; door = g_state.door_unlocked;
  dhterr = g_state.dht_error; rfiderr = g_state.rfid_error; rbad = g_state.reading_bad;
  strcpy(status, g_state.status);
  rssi_ok = g_state.rssi_valid; rssi = g_state.rssi; conn = g_state.conn_state;
  strncpy(uid, g_state.last_uid, sizeof(uid)); uid[sizeof(uid) - 1] = 0;
  strncpy(room, g_state.room_id, sizeof(room)); room[sizeof(room) - 1] = 0;
  strncpy(ip, g_state.ip, sizeof(ip)); ip[sizeof(ip) - 1] = 0;
  STATE_UNLOCK();
  String j = "{";
  j += "\"room_id\":\"" + jsonEscape(room) + "\",";
  j += "\"time\":\"" + l2LocalTime() + "\",";
  j += "\"temp_c\":" + (isnan(t) ? String("null") : String(t, 1)) + ",";
  j += "\"rh\":" + (isnan(h) ? String("null") : String((int)h)) + ",";
  j += "\"status\":\"" + String(status) + "\",";
  j += "\"flame\":" + String(flame ? "true" : "false") + ",";
  j += "\"door\":\"" + String(door ? "UNLOCKED" : "LOCKED") + "\",";
  j += "\"last_uid\":\"" + jsonEscape(uid) + "\",";
  j += "\"rssi\":" + (rssi_ok ? String(rssi) : String("null")) + ",";
  j += "\"chip_temp_c\":" + String(temperatureRead(), 1) + ",";
  j += "\"fw\":\"" + String(FW_VERSION) + "\",";
  j += "\"conn\":\"" + String(conn) + "\",";
  j += "\"quality\":\"" + String((dhterr || rfiderr || rbad) ? "bad" : "good") + "\",";
  j += "\"extras\":" + extrasJson() + ",";      // values that later levels add (heat index, alerts, ...)
  j += "\"mode\":\"" + String(l2NetMode()) + "\",";
  j += "\"ip\":\"" + jsonEscape(ip) + "\",";
  j += "\"mdns\":\"" + l2MdnsName() + ".local\",";
  j += "\"ap_ssid\":\"" + l2ApSsid() + "\",";
  j += "\"setup_error\":\"" + jsonEscape(l2SetupError()) + "\",";
  j += "\"uptime_s\":" + String((millis() - g_state.boot_ms) / 1000);
  j += "}";
  server.sendHeader("Cache-Control", "no-store");
  server.send(200, "application/json", j);
}

static void handleScan() {
  int n = WiFi.scanComplete();
  if (n >= 0) {
    String j = "[";
    for (int i = 0; i < n; i++) {
      if (i) j += ",";
      j += "{\"ssid\":\"" + jsonEscape(WiFi.SSID(i)) + "\",\"rssi\":" + String(WiFi.RSSI(i)) + "}";
    }
    j += "]";
    g_scan_cache = j;
    WiFi.scanDelete();
    g_scan_running = false;
  }
  if (!g_scan_running && strcmp(l2NetMode(), "SETUP") == 0) {
    WiFi.scanNetworks(true);                 // asynchronous: never blocks Level 1 or the web server
    g_scan_running = true;
  }
  server.sendHeader("Cache-Control", "no-store");
  server.send(200, "application/json", g_scan_cache);
}

static void copyArg(const char *name, char *dst, size_t n) {
  String v = server.arg(name);
  v.trim();
  strncpy(dst, v.c_str(), n - 1);
  dst[n - 1] = 0;
}

static void handleSave() {
  if (strcmp(l2NetMode(), "SETUP") != 0) { server.send(403, "text/plain", "Setup is only available in setup mode"); return; }
  copyArg("ssid", g_l2.ssid, sizeof(g_l2.ssid));
  copyArg("pass", g_l2.pass, sizeof(g_l2.pass));
  copyArg("room", g_l2.room, sizeof(g_l2.room));
  copyArg("token", g_l2.token, sizeof(g_l2.token));
  copyArg("server", g_l2.server, sizeof(g_l2.server));
  if (!g_l2.ssid[0]) { server.send(400, "text/plain", "Wi-Fi name is required"); return; }
  g_l2.verified = false;
  l2StoreSave();                               // everything is saved in flash (NVS)
  Serial.printf("[NET] settings saved (room=%s)\n", g_l2.room);
  STATE_LOCK(); strncpy(g_state.room_id, g_l2.room, sizeof(g_state.room_id) - 1); STATE_UNLOCK();
  l2NetApplySettings();
  server.send(200, "application/json", "{\"ok\":true}");
}

static void handleRoot() {
  sendPage(strcmp(l2NetMode(), "SETUP") == 0 ? SETUP_HTML : INDEX_HTML);
}

static void webTask(void *) {
  esp_task_wdt_add(nullptr);
  for (;;) {
    esp_task_wdt_reset();
    server.handleClient();
    vTaskDelay(pdMS_TO_TICKS(5));
  }
}

void l2WebStart() {
  if (WiFi.getMode() == WIFI_MODE_NULL) {
    WiFi.mode(WIFI_AP_STA);
  }
  server.on("/", HTTP_GET, handleRoot);
  server.on("/setup", HTTP_GET, []() { sendPage(SETUP_HTML); });
  server.on("/api/status", HTTP_GET, handleStatus);
  server.on("/api/scan", HTTP_GET, handleScan);
  server.on("/api/save", HTTP_POST, handleSave);
  server.onNotFound([]() { server.send(404, "text/plain", "Not found"); });
  server.begin();
  coreTaskCreate(webTask, "l2web", 8192, nullptr, 1, nullptr, 0);
}
