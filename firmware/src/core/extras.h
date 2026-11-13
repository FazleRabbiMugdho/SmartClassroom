// Core "extras": extra values a level wants on the local status page without editing the page code.
// A level calls extraSet("heat_index", "Heat index", "31.2 C"). The local page draws one card per extra.
// Two keys are special: "alert" (red banner, for example FIRE - EVACUATE) and "notice" (amber line).
// An empty value hides the extra.
#pragma once
#include <Arduino.h>

void extraSet(const char *key, const char *label, const char *value);
String extrasJson();     // JSON array: [{"k":"..","l":"..","v":".."}, ...]
