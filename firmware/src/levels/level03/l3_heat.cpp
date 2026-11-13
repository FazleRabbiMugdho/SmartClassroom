// Level 3 — heat: overall status (Safe / Warning / Danger), heat index and heat trend.
//  * Warning at 32 C or above, or 85% RH or above. Danger at 40 C or above.
//  * Leave Danger at 38 C or below; leave Warning at 30 C or below and 80% RH or below.
//  * A new status counts only after holding for 3 seconds.
//  * A failed or impossible reading (outside 0-50 C or 20-90% RH) makes quality "bad", keeps the last
//    status and is never used as a real reading.
//  * The trend (from the last 10 readings) is information only: it never changes light, buzzer or door.
// Heat never changes the door. The rules themselves live in l3_logic.h (tested on the PC).
#include <Arduino.h>
#include "core/tasks.h"
#include <esp_task_wdt.h>
#include "core/shared.h"
#include "core/light.h"
#include "core/buzzer.h"
#include "core/events.h"
#include "core/extras.h"
#include "levels/level03/l3.h"
#include "levels/level03/l3_logic.h"

L3Limits g_l3_limits;

static const char *NAMES[] = {"SAFE", "WARNING", "DANGER"};
static Heat g_heat = H_SAFE;
static L3Trend g_trend;
static const uint32_t HOLD_MS = 3000;

static void applyHeatOutputs(Heat h) {
  lightSet(LS_WARNING, h == H_WARN);
  lightSet(LS_HEAT_DANGER, h == H_DANGER);
  buzzerSet(LS_HEAT_DANGER, h == H_DANGER);     // one short beep every 2 s
}

static void heatTask(void *) {
  esp_task_wdt_add(nullptr);
  uint32_t last_read_ms = 0, pending_since = 0, last_extra = 0;
  Heat pending = H_SAFE;
  float t = NAN, h = NAN;
  bool have = false, invalid = false;
  char last_trend[8] = "";
  for (;;) {
    esp_task_wdt_reset();
    uint32_t now = millis();
    float ct, ch; uint32_t rms; bool dhterr, fire;
    STATE_LOCK();
    ct = g_state.tempC; ch = g_state.rh; rms = g_state.dht_read_ms; dhterr = g_state.dht_error; fire = g_state.fire_active;
    STATE_UNLOCK();

    if (rms && rms != last_read_ms) {                    // a new DHT reading arrived
      last_read_ms = rms;
      invalid = !l3ReadingValid(ct, ch);
      if (!invalid) {
        t = ct; h = ch; have = true;
        g_trend.push(t);
        float hi = l3HeatIndexC(t, h);
        STATE_LOCK();
        g_state.heat_index_c = hi;
        strncpy(g_state.heat_trend, g_trend.label(), sizeof(g_state.heat_trend) - 1);
        STATE_UNLOCK();
      }
    }
    bool bad = dhterr || invalid;
    STATE_LOCK(); g_state.reading_bad = bad; STATE_UNLOCK();

    if (have && !bad) {
      Heat cand = l3Candidate(t, h, g_heat, g_l3_limits.warn_c, g_l3_limits.danger_c);
      if (cand == g_heat) {
        pending = g_heat; pending_since = 0;
      } else {
        if (pending != cand || pending_since == 0) { pending = cand; pending_since = now; }
        else if (now - pending_since >= HOLD_MS) {      // held for 3 s: the new status counts
          char detail[24];
          snprintf(detail, sizeof(detail), "%s->%s", NAMES[g_heat], NAMES[cand]);
          g_heat = cand;
          pending_since = 0;
          applyHeatOutputs(g_heat);
          eventPublish("STATUS", detail);
        }
      }
    } else {
      pending_since = 0;                                // bad data: keep the last status, restart the hold
    }

    STATE_LOCK();
    strcpy(g_state.status, fire ? "FIRE" : NAMES[g_heat]);
    STATE_UNLOCK();

    if (now - last_extra >= 1000) {                     // heat index and trend on the local page
      last_extra = now;
      float hi; char trend[8];
      STATE_LOCK(); hi = g_state.heat_index_c; strcpy(trend, g_state.heat_trend); STATE_UNLOCK();
      if (!isnan(hi)) { char b[16]; snprintf(b, sizeof(b), "%.1f C", hi); extraSet("heat_index", "Heat index", b); }
      if (strcmp(trend, last_trend) != 0 || last_trend[0] == 0) { extraSet("trend", "Heat trend", trend); strcpy(last_trend, trend); }
    }
    vTaskDelay(pdMS_TO_TICKS(100));
  }
}

void l3HeatStart() {
  coreTaskCreate(heatTask, "l3heat", 4096, nullptr, 1, nullptr, 0);
}
