// Level 2 — settings and the never-reused sequence number, kept in flash (NVS).
#include <Preferences.h>
#include "levels/level02/l2.h"

L2Settings g_l2;
static Preferences prefs;
static SemaphoreHandle_t g_store_mutex = nullptr;
static uint32_t s_seq = 0;       // last seq handed out
static uint32_t s_seq_hw = 0;    // high-water mark already written to flash

String l2DeviceId() { return String(TEAM_ID) + "-D1"; }
String l2ApSsid() { return String("SmartClass-") + TEAM_ID; }
String l2MdnsName() {
  String s = String("smartclass-") + TEAM_ID;
  s.toLowerCase();
  return s;
}

static void getStr(const char *key, char *dst, size_t n) {
  String v = prefs.getString(key, "");
  strncpy(dst, v.c_str(), n - 1);
  dst[n - 1] = 0;
}

void l2StoreLoad() {
  if (!g_store_mutex) g_store_mutex = xSemaphoreCreateMutex();
  prefs.begin("fastrobox", false);
  getStr("ssid", g_l2.ssid, sizeof(g_l2.ssid));
  getStr("pass", g_l2.pass, sizeof(g_l2.pass));
  getStr("room", g_l2.room, sizeof(g_l2.room));
  getStr("token", g_l2.token, sizeof(g_l2.token));
  getStr("server", g_l2.server, sizeof(g_l2.server));
  g_l2.verified = prefs.getBool("verified", false);
  // Start the counter at the saved high-water mark: every earlier seq is below it, so none repeats.
  s_seq = prefs.getULong("seq_hw", 0);
  s_seq_hw = s_seq;
}

void l2StoreSave() {
  xSemaphoreTake(g_store_mutex, portMAX_DELAY);
  prefs.putString("ssid", g_l2.ssid);
  prefs.putString("pass", g_l2.pass);
  prefs.putString("room", g_l2.room);
  prefs.putString("token", g_l2.token);
  prefs.putString("server", g_l2.server);
  prefs.putBool("verified", g_l2.verified);
  xSemaphoreGive(g_store_mutex);
}

void l2StoreClear() {
  xSemaphoreTake(g_store_mutex, portMAX_DELAY);
  prefs.remove("ssid");
  prefs.remove("pass");
  prefs.remove("room");
  prefs.remove("token");
  prefs.remove("server");
  prefs.remove("verified");
  xSemaphoreGive(g_store_mutex);
  g_l2 = L2Settings();
}

uint32_t l2NextSeq() {
  xSemaphoreTake(g_store_mutex, portMAX_DELAY);
  if (s_seq >= s_seq_hw) {                 // write one flash value per 100 messages, not per message
    s_seq_hw = s_seq + 100;
    prefs.putULong("seq_hw", s_seq_hw);
  }
  s_seq++;
  uint32_t v = s_seq;
  xSemaphoreGive(g_store_mutex);
  return v;
}
