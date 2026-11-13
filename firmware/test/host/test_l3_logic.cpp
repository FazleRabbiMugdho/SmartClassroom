// Host test for the Level 3 rules (no board needed). Build and run from the firmware folder:
//   g++ -std=c++11 -Isrc test/host/test_l3_logic.cpp -o test/host/test_l3.exe && test/host/test_l3.exe
#include <cstdio>
#include <cstring>
#include <initializer_list>
#include "levels/level03/l3_logic.h"

static int fails = 0;
#define CHECK(cond, msg) do { if (!(cond)) { printf("FAIL: %s\n", msg); fails++; } else printf("ok:   %s\n", msg); } while (0)

// Simulates the 3 s hold: the candidate must stay different for 3 s before the status changes.
struct Sim {
  Heat cur = H_SAFE; Heat pending = H_SAFE; int since = -1; int changes = 0; int dangerToWarn = 0, warnToSafe = 0;
  void step(int t_ms, float t, float rh) {
    Heat c = l3Candidate(t, rh, cur, 32.0f, 40.0f);
    if (c == cur) { pending = cur; since = -1; return; }
    if (pending != c || since < 0) { pending = c; since = t_ms; return; }
    if (t_ms - since >= 3000) {
      if (cur == H_DANGER && c == H_WARN) dangerToWarn++;
      if (cur == H_WARN && c == H_SAFE) warnToSafe++;
      cur = c; since = -1; changes++;
    }
  }
};

int main() {
  // Entering and leaving thresholds
  CHECK(l3Candidate(31.9f, 50, H_SAFE, 32, 40) == H_SAFE, "31.9 C stays Safe");
  CHECK(l3Candidate(32.0f, 50, H_SAFE, 32, 40) == H_WARN, "32 C enters Warning");
  CHECK(l3Candidate(25.0f, 85, H_SAFE, 32, 40) == H_WARN, "85% RH enters Warning");
  CHECK(l3Candidate(25.0f, 84, H_SAFE, 32, 40) == H_SAFE, "84% RH stays Safe");
  CHECK(l3Candidate(40.0f, 50, H_WARN, 32, 40) == H_DANGER, "40 C enters Danger");
  CHECK(l3Candidate(39.0f, 50, H_DANGER, 32, 40) == H_DANGER, "39 C stays Danger (hysteresis)");
  CHECK(l3Candidate(38.0f, 50, H_DANGER, 32, 40) == H_WARN, "38 C leaves Danger to Warning");
  CHECK(l3Candidate(31.0f, 50, H_WARN, 32, 40) == H_WARN, "31 C stays Warning");
  CHECK(l3Candidate(30.0f, 79, H_WARN, 32, 40) == H_SAFE, "30 C and 79% RH leaves Warning");
  CHECK(l3Candidate(30.0f, 81, H_WARN, 32, 40) == H_WARN, "30 C but 81% RH stays Warning");
  CHECK(l3Candidate(30.0f, 80, H_WARN, 32, 40) == H_SAFE, "30 C and 80% RH leaves Warning");

  // Reading validity
  CHECK(!l3ReadingValid(51, 50), "51 C is impossible");
  CHECK(!l3ReadingValid(-1, 50), "-1 C is impossible");
  CHECK(!l3ReadingValid(25, 19), "19% RH is impossible");
  CHECK(!l3ReadingValid(25, 91), "91% RH is impossible");
  CHECK(!l3ReadingValid(NAN, 50), "NaN is a failed reading");
  CHECK(l3ReadingValid(0, 20) && l3ReadingValid(50, 90), "limits 0/50 C and 20/90% are valid");

  // Hair-dryer run: warm up to Danger, then cool. Exactly one Danger->Warning and one Warning->Safe change.
  Sim s;
  int ms = 0;
  float temps[] = {28, 31, 33, 33, 36, 39, 41, 42, 42, 41, 39, 37, 35, 33, 31, 30, 29, 28, 28, 28};
  for (float t : temps) { for (int k = 0; k < 6; k++) { s.step(ms, t, 55); ms += 1000; } }
  CHECK(s.cur == H_SAFE, "run ends Safe");
  CHECK(s.dangerToWarn == 1, "exactly one Danger -> Warning change");
  CHECK(s.warnToSafe == 1, "exactly one Warning -> Safe change");

  // A candidate that lasts under 3 s does not count.
  Sim q;
  q.step(0, 33, 50); q.step(1000, 33, 50); q.step(2000, 28, 50);
  CHECK(q.cur == H_SAFE && q.changes == 0, "a 2 s spike does not change the status");

  // Trend
  L3Trend up; for (float v : {26.f, 26.f, 27.f, 27.f, 28.f, 28.f, 29.f, 29.f, 30.f, 30.f}) up.push(v);
  CHECK(strcmp(up.label(), "RISING") == 0, "gentle warming shows RISING");
  L3Trend flat; for (int i = 0; i < 10; i++) flat.push(28.f);
  CHECK(strcmp(flat.label(), "STABLE") == 0, "flat readings show STABLE");
  L3Trend down; for (float v : {30.f, 30.f, 29.f, 29.f, 28.f, 28.f, 27.f, 27.f, 26.f, 26.f}) down.push(v);
  CHECK(strcmp(down.label(), "FALLING") == 0, "cooling shows FALLING");
  L3Trend few; few.push(20.f); few.push(30.f);
  CHECK(strcmp(few.label(), "STABLE") == 0, "fewer than 3 readings show STABLE");

  // Heat index sanity (NWS table: 90 F / 70% RH is about 106 F = 41.1 C; 80 F / 40% RH is about 80 F)
  float hi1 = l3HeatIndexC((90 - 32) * 5.0f / 9.0f, 70);
  CHECK(hi1 > 40.0f && hi1 < 42.5f, "heat index of 90 F at 70% RH is about 41 C");
  float hi2 = l3HeatIndexC(20.0f, 50);
  CHECK(hi2 > 18.0f && hi2 < 21.5f, "heat index at 20 C is close to the air temperature");
  float hi3 = l3HeatIndexC(35.0f, 60);
  CHECK(hi3 > 35.0f, "heat index at 35 C and 60% RH is above the air temperature");

  printf(fails ? "\nHOST TEST FAILED (%d)\n" : "\nHOST TEST: ALL PASSED\n", fails);
  return fails ? 1 : 0;
}
