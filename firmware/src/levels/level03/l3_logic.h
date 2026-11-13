// Level 3 pure logic: no Arduino dependencies, so it is unit-tested on the PC (firmware/test/host).
#pragma once
#include <math.h>
#include <stdint.h>

enum Heat { H_SAFE = 0, H_WARN = 1, H_DANGER = 2 };

// Heat index ("feels like"): NWS Rothfusz regression, with the simple Steadman formula below 80 F.
inline float l3HeatIndexC(float c, float rh) {
  float T = c * 9.0f / 5.0f + 32.0f;
  float hi = 0.5f * (T + 61.0f + ((T - 68.0f) * 1.2f) + (rh * 0.094f));
  if ((hi + T) / 2.0f >= 80.0f) {
    hi = -42.379f + 2.04901523f * T + 10.14333127f * rh - 0.22475541f * T * rh - 0.00683783f * T * T -
         0.05481717f * rh * rh + 0.00122874f * T * T * rh + 0.00085282f * T * rh * rh - 0.00000199f * T * T * rh * rh;
    if (rh < 13 && T >= 80 && T <= 112) hi -= ((13 - rh) / 4.0f) * sqrtf((17 - fabsf(T - 95)) / 17.0f);
    else if (rh > 85 && T >= 80 && T <= 87) hi += ((rh - 85) / 10.0f) * ((87 - T) / 5.0f);
  }
  return (hi - 32.0f) * 5.0f / 9.0f;
}

// Which status do these readings call for, given the current status? (hysteresis)
//  Enter Warning at warn C or 85% RH; enter Danger at danger C.
//  Leave Danger at danger-2 C or below; leave Warning at warn-2 C or below with RH at 80% or below.
inline Heat l3Candidate(float t, float rh, Heat cur, float warn, float danger) {
  bool danger_on = (cur == H_DANGER) ? (t > danger - 2.0f) : (t >= danger);
  bool warn_on = (cur >= H_WARN) ? !(t <= warn - 2.0f && rh <= 80.0f) : (t >= warn || rh >= 85.0f);
  return danger_on ? H_DANGER : (warn_on ? H_WARN : H_SAFE);
}

// A reading is usable only inside 0-50 C and 20-90 % RH.
inline bool l3ReadingValid(float t, float rh) {
  return !isnan(t) && !isnan(rh) && t >= 0 && t <= 50 && rh >= 20 && rh <= 90;
}

// Heat trend from the last 10 temperature readings (information only).
struct L3Trend {
  float w[10];
  uint8_t n = 0;
  void push(float t) {
    if (n < 10) w[n++] = t;
    else { for (uint8_t i = 1; i < 10; i++) w[i - 1] = w[i]; w[9] = t; }
  }
  const char *label() const {
    if (n < 3) return "STABLE";
    float sx = 0, sy = 0, sxy = 0, sxx = 0;
    for (uint8_t i = 0; i < n; i++) { sx += i; sy += w[i]; sxy += i * w[i]; sxx += (float)i * i; }
    float nn = n;
    float slope = (nn * sxy - sx * sy) / (nn * sxx - sx * sx);
    float delta = slope * (nn - 1);
    if (delta >= 0.8f) return "RISING";
    if (delta <= -0.8f) return "FALLING";
    return "STABLE";
  }
};
