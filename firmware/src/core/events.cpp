#include <Arduino.h>
#include "core/events.h"

static EventHandler g_handlers[4];
static uint8_t g_count = 0;

void eventSubscribe(EventHandler handler) {
  if (g_count < 4) g_handlers[g_count++] = handler;
}

void eventPublish(const char *type, const char *detail) {
  if (detail && detail[0]) Serial.printf("[EVENT] %s %s\n", type, detail);
  else Serial.printf("[EVENT] %s\n", type);
  for (uint8_t i = 0; i < g_count; i++) g_handlers[i](type, detail ? detail : "");
}
