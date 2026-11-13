// Level 2 — Wi-Fi setup and secure telemetry. Glue only: starts the Level 2 parts.
// Stacked on Level 1: reads Level 1 values from core/shared.h; the light, events and serial
// commands go through the core services, so Level 1 code is not touched by Level 2.
#include <Arduino.h>
#include "core/shared.h"
#include "core/events.h"
#include "core/console.h"
#include "levels/level02.h"
#include "levels/level02/l2.h"

static void cmdReset(const char *) { l2ResetAndRestart(); }

static void setup02() {
  l2StoreLoad();
  STATE_LOCK(); strncpy(g_state.room_id, g_l2.room[0] ? g_l2.room : "-", sizeof(g_state.room_id) - 1); STATE_UNLOCK();

  l2TelemetryStart();
  eventSubscribe(l2OnEvent);                      // every device event is also sent to the platform
  // Level 1 already published BOOT before this level subscribed, so queue the same BOOT event now.
  char detail[40];
  snprintf(detail, sizeof(detail), "reason=%s", g_state.reset_reason);
  l2OnEvent("BOOT", detail);

  consoleRegisterCommand("reset", cmdReset);      // Serial command "reset" (paper section 5.2)
  l2NetStart();
  l2WebStart();
}

const LevelModule LEVEL_02 = {"L02 Wi-Fi setup and secure telemetry", setup02};
