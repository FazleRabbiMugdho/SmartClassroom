// Core light arbiter: the onboard RGB LED is the device's only light (paper section 4).
// Several states can be active at once; the one with the LOWER number is shown.
// A level never writes the LED directly. It calls lightSet(state, true/false).
#pragma once
#include <Arduino.h>

enum LightState : uint8_t {
  LS_FIRE = 1,          // red, fast flashing (5 Hz)
  LS_PANIC,             // red and blue alternating
  LS_ACCESS_GRANTED,    // solid green
  LS_ACCESS_DENIED,     // three quick red flashes
  LS_HEAT_DANGER,       // red 2 Hz heartbeat
  LS_SENSOR_ERROR,      // magenta 2 Hz heartbeat
  LS_CAMERA_FAULT,      // cyan 2 Hz heartbeat
  LS_WEATHER,           // purple 2 Hz heartbeat
  LS_WARNING,           // yellow 2 Hz heartbeat
  LS_WIFI_SETUP,        // blue 2 Hz heartbeat (setup mode or offline)
  LS_SAFE,              // green 2 Hz heartbeat (always active as the default)
  LS_COUNT
};

void lightStart();                              // call once in setup(), before the levels
void lightSet(LightState s, bool active);       // safe to call from any task
