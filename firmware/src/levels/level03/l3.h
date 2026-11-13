// Level 3 internal header. Not used outside src/levels/level03*.
#pragma once
#include <Arduino.h>

// Alarm limits. Defaults from the paper; Level 5 changes them from the dashboard.
struct L3Limits {
  volatile float warn_c = 32.0f;     // Warning at or above this temperature (leave 2 C below it)
  volatile float danger_c = 40.0f;   // Danger at or above this temperature (leave 2 C below it)
};
extern L3Limits g_l3_limits;

void l3HeatStart();                         // heat status, heat index, trend
void l3FireStart();                         // fire latch, Teacher tags, panic pad, Reset fire
void l3RequestResetFire(const char *source);// from the platform or the serial command
