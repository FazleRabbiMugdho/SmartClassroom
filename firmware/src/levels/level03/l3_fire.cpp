// Level 3 — fire, Teacher tags, touch panic pad and the fail-safe door.
//  * A flame seen continuously for 2 s is FIRE at once: continuous buzzer, fast red flashing, door UNLOCKED,
//    "FIRE - EVACUATE" on the local page, FIRE event to the platform. No 3 s hold.
//  * The fire state is saved in flash, so after a power cut the door is still UNLOCKED.
//  * Only a Teacher tag silences the buzzer, and only after the flame has gone. A student card never does.
//  * The door stays UNLOCKED until a Teacher or Admin sends "Reset fire".
//  * Touch panic pad on GPIO1: baseline calibrated at start-up; a touch of 2 s raises PANIC for 10 s;
//    a shorter touch is ignored.
// Fire overrides every other door rule: later levels must check g_state.fire_active before locking.
#include <Arduino.h>
#include "core/tasks.h"
#include <Preferences.h>
#include <esp_task_wdt.h>
#include "pins.h"
#include "core/shared.h"
#include "core/light.h"
#include "core/buzzer.h"
#include "core/events.h"
#include "core/extras.h"
#include "core/console.h"
#include "levels/level02.h"
#include "levels/level03/l3.h"

static Preferences prefs;
static const uint32_t FIRE_HOLD_MS = 2000;
static const uint32_t PANIC_HOLD_MS = 2000;
static const uint32_t PANIC_DURATION_MS = 10000;

// ---- Teacher tag list (kept in flash)
static char g_teachers[8][24];
static uint8_t g_tcount = 0;
static volatile bool g_add_armed = false;
static volatile uint32_t g_add_until = 0;

static bool isTeacher(const char *uid) {
  for (uint8_t i = 0; i < g_tcount; i++) if (strcmp(g_teachers[i], uid) == 0) return true;
  return false;
}
static void saveTeachers() {
  String s;
  for (uint8_t i = 0; i < g_tcount; i++) { if (i) s += ","; s += g_teachers[i]; }
  prefs.putString("teachers", s);
}
static void loadTeachers() {
  String s = prefs.getString("teachers", "");
  g_tcount = 0;
  int start = 0;
  while (start <= (int)s.length() && g_tcount < 8) {
    int comma = s.indexOf(',', start);
    String one = comma < 0 ? s.substring(start) : s.substring(start, comma);
    if (one.length() && one.length() < 24) { strcpy(g_teachers[g_tcount++], one.c_str()); }
    if (comma < 0) break;
    start = comma + 1;
  }
}

// ---- incoming requests (set from other tasks, handled in the fire task)
static char g_tap_uid[24];
static volatile bool g_tap_pending = false;
static char g_reset_src[16];
static volatile bool g_reset_req = false;

void l3RequestResetFire(const char *source) {
  strncpy(g_reset_src, source, sizeof(g_reset_src) - 1);
  g_reset_src[sizeof(g_reset_src) - 1] = 0;
  g_reset_req = true;
}

static void onEvent(const char *type, const char *detail) {
  if (strcmp(type, "CARD_TAP") == 0 && strncmp(detail, "uid=", 4) == 0) {
    strncpy(g_tap_uid, detail + 4, sizeof(g_tap_uid) - 1);
    g_tap_uid[sizeof(g_tap_uid) - 1] = 0;
    g_tap_pending = true;
  }
}

// ---- fire
static void saveFire() {
  bool a, s;
  STATE_LOCK(); a = g_state.fire_active; s = g_state.fire_silenced; STATE_UNLOCK();
  prefs.putBool("fire", a);
  prefs.putBool("sil", s);
}

static void setFireOutputs(bool active, bool silenced) {
  lightSet(LS_FIRE, active);
  buzzerSet(LS_FIRE, active && !silenced);
  extraSet("alert", "Alert", active ? "FIRE \xE2\x80\x94 EVACUATE" : "");
}

static void triggerFire(const char *detail, bool restored) {
  STATE_LOCK();
  g_state.fire_active = true;
  if (!restored) g_state.fire_silenced = false;
  g_state.door_unlocked = true;                 // fail-safe: a fire always opens the door
  strcpy(g_state.status, "FIRE");
  bool sil = g_state.fire_silenced;
  STATE_UNLOCK();
  setFireOutputs(true, sil);
  saveFire();
  eventPublish("FIRE", detail);
}

static void resetFire(const char *src, bool flame_now) {
  bool active;
  STATE_LOCK(); active = g_state.fire_active; STATE_UNLOCK();
  if (!active) { Serial.println("[CMD] reset fire: no fire is active"); return; }
  if (flame_now) { eventPublish("RESET_FIRE_REFUSED", "flame still present"); return; }
  STATE_LOCK();
  g_state.fire_active = false;
  g_state.fire_silenced = false;
  g_state.door_unlocked = false;                // Reset fire locks the door; the status returns to Safe (heat task)
  STATE_UNLOCK();
  setFireOutputs(false, false);
  saveFire();
  char d[40];
  snprintf(d, sizeof(d), "reset by %s", src);
  eventPublish("FIRE_CLEARED", d);
}

static void silenceFire(const char *uid, bool flame_now, uint32_t *notice_until) {
  bool active, sil;
  STATE_LOCK(); active = g_state.fire_active; sil = g_state.fire_silenced; STATE_UNLOCK();
  if (!active || sil) return;
  if (flame_now) {                              // Teacher tag is refused while the flame is still there
    extraSet("notice", "Notice", "CANNOT SILENCE \xE2\x80\x94 FLAME PRESENT");
    *notice_until = millis() + 8000;
    Serial.println("[EVENT] SILENCE_REFUSED CANNOT SILENCE - FLAME PRESENT");
    return;
  }
  STATE_LOCK(); g_state.fire_silenced = true; STATE_UNLOCK();
  buzzerSet(LS_FIRE, false);
  saveFire();
  char d[48];
  snprintf(d, sizeof(d), "teacher tag %s", uid);
  eventPublish("SILENCED", d);                  // the door stays UNLOCKED
}

// ---- panic pad
static uint32_t g_baseline = 0;
static uint32_t g_dev = 3000;
static bool touched(uint32_t v) {
  int32_t d = (int32_t)v - (int32_t)g_baseline;
  return (d < 0 ? -d : d) > (int32_t)g_dev;     // works whether touching raises or lowers the reading
}

static void calibrateTouch() {
  vTaskDelay(pdMS_TO_TICKS(500));               // let the pin settle
  uint64_t sum = 0;
  for (int i = 0; i < 16; i++) { sum += touchRead(PIN_TOUCH_PAD); vTaskDelay(pdMS_TO_TICKS(10)); esp_task_wdt_reset(); }
  g_baseline = (uint32_t)(sum / 16);
  g_dev = max<uint32_t>(g_baseline / 5, 3000);
  Serial.printf("[STATUS] touch pad baseline=%lu threshold=+/-%lu (GPIO%d)\n",
                (unsigned long)g_baseline, (unsigned long)g_dev, PIN_TOUCH_PAD);
}

// ---- serial commands
static void cmdResetFire(const char *) { l3RequestResetFire("serial"); }
static void cmdTouch(const char *) {
  Serial.printf("[CMD] touch baseline=%lu now=%lu threshold=+/-%lu\n", (unsigned long)g_baseline,
                (unsigned long)touchRead(PIN_TOUCH_PAD), (unsigned long)g_dev);
}
static void cmdTeacher(const char *args) {
  String a(args);
  a.trim();
  if (a == "add") {
    g_add_until = millis() + 30000;
    g_add_armed = true;
    Serial.println("[CMD] tap the Teacher tag on the reader within 30 seconds");
  } else if (a == "list") {
    Serial.printf("[CMD] %u teacher tag(s)\n", g_tcount);
    for (uint8_t i = 0; i < g_tcount; i++) Serial.printf("[CMD]   %s\n", g_teachers[i]);
  } else if (a == "clear") {
    g_tcount = 0; saveTeachers();
    Serial.println("[CMD] teacher tags cleared");
  } else if (a.startsWith("remove ")) {
    String uid = a.substring(7); uid.trim(); uid.toUpperCase();
    for (uint8_t i = 0; i < g_tcount; i++) {
      if (uid == g_teachers[i]) {
        for (uint8_t j = i + 1; j < g_tcount; j++) strcpy(g_teachers[j - 1], g_teachers[j]);
        g_tcount--; saveTeachers();
        Serial.println("[CMD] teacher tag removed");
        return;
      }
    }
    Serial.println("[CMD] no such teacher tag");
  } else {
    Serial.println("[CMD] usage: teacher add | list | remove <UID> | clear");
  }
}

static void fireTask(void *) {
  esp_task_wdt_add(nullptr);
  calibrateTouch();
  uint32_t flame_since = 0, touch_since = 0, panic_until = 0, notice_until = 0;
  bool panic_latch = false;
  for (;;) {
    esp_task_wdt_reset();
    uint32_t now = millis();
    bool flame, fire;
    STATE_LOCK(); flame = g_state.flame; fire = g_state.fire_active; STATE_UNLOCK();

    // Flame seen continuously for 2 s: FIRE at once.
    if (!fire) {
      if (flame) {
        if (!flame_since) flame_since = now;
        else if (now - flame_since >= FIRE_HOLD_MS) { triggerFire("flame held for 2 s", false); flame_since = 0; }
      } else {
        flame_since = 0;                          // a short flicker is ignored
      }
    }

    // Card taps: Teacher tag registration and silence.
    if (g_tap_pending) {
      char uid[24];
      strcpy(uid, g_tap_uid);
      g_tap_pending = false;
      if (g_add_armed && now < g_add_until) {
        g_add_armed = false;
        if (!isTeacher(uid) && g_tcount < 8) { strcpy(g_teachers[g_tcount++], uid); saveTeachers(); }
        Serial.printf("[CMD] teacher tag registered: %s\n", uid);
      } else if (isTeacher(uid)) {
        silenceFire(uid, flame, &notice_until);
      }                                           // a student card never silences the alarm
    }
    if (g_add_armed && now >= g_add_until) { g_add_armed = false; Serial.println("[CMD] teacher registration timed out"); }
    if (notice_until && now >= notice_until) { extraSet("notice", "Notice", ""); notice_until = 0; }

    // Reset fire (from the platform or the serial command).
    if (g_reset_req) { g_reset_req = false; resetFire(g_reset_src, flame); }

    // Touch panic pad: 2 s touch = PANIC for 10 s; under 2 s is ignored.
    if (g_baseline) {
      bool t = touched(touchRead(PIN_TOUCH_PAD));
      if (t) {
        if (!touch_since) touch_since = now;
        if (!panic_latch && now - touch_since >= PANIC_HOLD_MS) {
          panic_latch = true;
          panic_until = now + PANIC_DURATION_MS;
          STATE_LOCK(); g_state.panic_active = true; STATE_UNLOCK();
          lightSet(LS_PANIC, true);
          buzzerSet(LS_PANIC, true);
          if (!fire) extraSet("alert", "Alert", "PANIC");
          eventPublish("PANIC", "touch pad held for 2 s");
        }
      } else {
        touch_since = 0;
        panic_latch = false;
      }
      if (panic_until && now >= panic_until) {
        panic_until = 0;
        STATE_LOCK(); g_state.panic_active = false; fire = g_state.fire_active; STATE_UNLOCK();
        lightSet(LS_PANIC, false);
        buzzerSet(LS_PANIC, false);
        if (!fire) extraSet("alert", "Alert", "");
      }
    }
    vTaskDelay(pdMS_TO_TICKS(50));
  }
}

// ---- Reset fire from the platform: polls the command queue every 3 s while the device is LIVE.
static void commandTask(void *) {
  esp_task_wdt_add(nullptr);
  uint32_t last = 0;
  for (;;) {
    esp_task_wdt_reset();
    uint32_t now = millis();
    bool live;
    STATE_LOCK(); live = strcmp(g_state.conn_state, "LIVE") == 0; STATE_UNLOCK();
    if (live && now - last >= 3000) {
      last = now;
      String resp;
      int code = level02Request("GET", "/api/device/commands", "", &resp);
      if (code == 200 && resp.indexOf("\"type\":\"RESET_FIRE\"") >= 0) l3RequestResetFire("dashboard");
    }
    vTaskDelay(pdMS_TO_TICKS(200));
  }
}

void l3FireStart() {
  prefs.begin("l3", false);                      // separate flash namespace: Level 2's "fastrobox" is untouched
  loadTeachers();
  eventSubscribe(onEvent);
  consoleRegisterCommand("resetfire", cmdResetFire);
  consoleRegisterCommand("teacher", cmdTeacher);
  consoleRegisterCommand("touch", cmdTouch);

  // Restore the fire latch after a restart or power cut: the door stays UNLOCKED.
  if (prefs.getBool("fire", false)) {
    STATE_LOCK(); g_state.fire_silenced = prefs.getBool("sil", false); STATE_UNLOCK();
    triggerFire("latched fire restored after restart", true);
  }
  coreTaskCreate(fireTask, "l3fire", 5120, nullptr, 2, nullptr, 0);
  coreTaskCreate(commandTask, "l3cmd", 6144, nullptr, 1, nullptr, 0);
}
