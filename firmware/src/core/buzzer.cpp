#include <Arduino.h>
#include "core/tasks.h"
#include <esp_task_wdt.h>
#include "pins.h"
#include "core/buzzer.h"

static volatile uint16_t g_bmask = 0;
static volatile uint8_t g_pending = 0;
static portMUX_TYPE g_bmux = portMUX_INITIALIZER_UNLOCKED;

void buzzerSet(LightState s, bool active) {
  portENTER_CRITICAL(&g_bmux);
  if (active) g_bmask |= (1u << s); else g_bmask &= ~(1u << s);
  portEXIT_CRITICAL(&g_bmux);
}

void buzzerBeeps(uint8_t n) {
  portENTER_CRITICAL(&g_bmux);
  uint16_t total = g_pending + n;
  g_pending = total > 6 ? 6 : total;
  portEXIT_CRITICAL(&g_bmux);
}

static void buzzTask(void *) {
  esp_task_wdt_add(nullptr);
  bool playing = false;
  uint32_t start = 0;
  uint8_t count = 0;
  for (;;) {
    esp_task_wdt_reset();
    uint32_t now = millis();
    uint16_t mask;
    portENTER_CRITICAL(&g_bmux);
    mask = g_bmask;
    portEXIT_CRITICAL(&g_bmux);
    bool on = false;
    if (mask & (1u << LS_FIRE)) {                        // 200 ms on / 200 ms off, continuous
      on = (now % 400) < 200;
    } else if (mask & (1u << LS_PANIC)) {                // 100 ms on / 100 ms off
      on = (now % 200) < 100;
    } else {
      if (!playing && g_pending > 0) {                   // play the queued beeps (100 ms on / 100 ms off)
        portENTER_CRITICAL(&g_bmux);
        count = g_pending; g_pending = 0;
        portEXIT_CRITICAL(&g_bmux);
        playing = true; start = now;
      }
      if (playing) {
        on = ((now - start) % 200) < 100;
        if (now - start >= (uint32_t)count * 200) { playing = false; on = false; }
      } else if (mask & (1u << LS_HEAT_DANGER)) {       // one short beep every 2 s
        on = (now % 2000) < 100;
      }
    }
    digitalWrite(PIN_BUZZER, on ? HIGH : LOW);          // active buzzer: HIGH = sound (UNVERIFIED)
    vTaskDelay(pdMS_TO_TICKS(10));
  }
}

void buzzerStart() {
  pinMode(PIN_BUZZER, OUTPUT);
  digitalWrite(PIN_BUZZER, LOW);
  coreTaskCreate(buzzTask, "buzzer", 3072, nullptr, 1, nullptr, 0);
}
