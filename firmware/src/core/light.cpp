// Core light arbiter implementation. Pattern timing comes from millis(), so nothing blocks.
#include <Arduino.h>
#include "core/tasks.h"
#include <esp_task_wdt.h>
#include <esp32-hal-rgb-led.h>
#include "pins.h"
#include "core/light.h"

static volatile uint16_t g_mask = (1u << LS_SAFE);   // Safe is the default state
static portMUX_TYPE g_light_mux = portMUX_INITIALIZER_UNLOCKED;

void lightSet(LightState s, bool active) {
  portENTER_CRITICAL(&g_light_mux);
  if (active) g_mask |= (1u << s); else g_mask &= ~(1u << s);
  if (s == LS_SAFE) g_mask |= (1u << LS_SAFE);        // Safe can never be switched off
  portEXIT_CRITICAL(&g_light_mux);
}

static void show(uint8_t r, uint8_t g, uint8_t b) { neopixelWrite(PIN_RGB_LED, r, g, b); }

// 2 Hz heartbeat: 250 ms on, 250 ms off, in the given colour.
static void heartbeat(uint32_t now, uint8_t r, uint8_t g, uint8_t b) {
  if ((now % 500) < 250) show(r, g, b); else show(0, 0, 0);
}

static void lightTask(void *) {
  esp_task_wdt_add(nullptr);
  const uint8_t L = 60;     // brightness
  for (;;) {
    esp_task_wdt_reset();
    uint16_t mask;
    portENTER_CRITICAL(&g_light_mux);
    mask = g_mask;
    portEXIT_CRITICAL(&g_light_mux);
    uint32_t now = millis();
    LightState s = LS_SAFE;
    for (uint8_t i = 1; i < LS_COUNT; i++) {
      if (mask & (1u << i)) { s = (LightState)i; break; }
    }
    switch (s) {
      case LS_FIRE:           if ((now % 200) < 100) show(L, 0, 0); else show(0, 0, 0); break;
      case LS_PANIC:          if ((now % 200) < 100) show(L, 0, 0); else show(0, 0, L); break;
      case LS_ACCESS_GRANTED: show(0, L, 0); break;
      case LS_ACCESS_DENIED: {                          // 3 quick flashes, then a pause
        uint32_t t = now % 1000;
        if (t < 600 && (t % 200) < 100) show(L, 0, 0); else show(0, 0, 0);
        break;
      }
      case LS_HEAT_DANGER:    heartbeat(now, L, 0, 0); break;
      case LS_SENSOR_ERROR:   heartbeat(now, L, 0, L); break;
      case LS_CAMERA_FAULT:   heartbeat(now, 0, L, L); break;
      case LS_WEATHER:        heartbeat(now, L / 2, 0, L); break;
      case LS_WARNING:        heartbeat(now, L, L, 0); break;
      case LS_WIFI_SETUP:     heartbeat(now, 0, 0, L); break;
      default:                heartbeat(now, 0, L, 0); break;   // LS_SAFE
    }
    vTaskDelay(pdMS_TO_TICKS(20));
  }
}

void lightStart() {
  coreTaskCreate(lightTask, "light", 3072, nullptr, 1, nullptr, 0);
}
