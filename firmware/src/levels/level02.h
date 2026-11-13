// Level 2: Wi-Fi setup and secure telemetry (paper section 8, Level 2; checklist A3, A4, A6, L2 items).
// Built strictly on top of Level 1: it reads Level 1's values from core/shared.h, publishes nothing
// back into Level 1, and uses only the core services (light arbiter, event bus, console commands).
#pragma once
#include <Arduino.h>
#include "levels/level.h"

extern const LevelModule LEVEL_02;

// Platform client for later levels. Sends one HTTPS request with the device token (checked
// certificate). method is "GET" or "POST". Returns the HTTP status, or 0 when the device is not
// online yet or the request failed. Blocks for at most a few seconds, so call it from your own task.
int level02Request(const char *method, const char *path, const String &body, String *response);
