// Core buzzer arbiter (paper section 4). A level never drives the buzzer pin directly.
//   Continuous patterns: buzzerSet(LS_FIRE | LS_PANIC | LS_HEAT_DANGER, on/off)
//   One-shot beeps:      buzzerBeeps(n)   (access granted 1, denied 2, weather 3)
// Priority: Fire > Panic > pending one-shot beeps > Heat Danger beep every 2 s.
#pragma once
#include <Arduino.h>
#include "core/light.h"

void buzzerStart();
void buzzerSet(LightState s, bool active);
void buzzerBeeps(uint8_t n);
