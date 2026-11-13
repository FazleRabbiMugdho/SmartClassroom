// FastRobox 1.0 firmware — composition root.
//
// Every level is its own module under src/levels/ (levelNN.h / levelNN.cpp).
// This file only lists which levels are built in, in order, and starts the shared console.
// To add a level: write src/levels/levelNN.cpp, then add it to ENABLED_LEVELS below.
//
// Serial: 115200 baud. Tags: [STATUS] [CARD] [EVENT] [ERROR] [NET] [OTA] [CAM] [BLE] [CMD].
// Status: UNVERIFIED on hardware.
#include <Arduino.h>
#include "core/shared.h"
#include "core/console.h"
#include "core/light.h"
#include "core/buzzer.h"
#include "levels/level.h"
#include "levels/level01.h"
#include "levels/level02.h"
#include "levels/level03.h"

// Level 1: Dual-Core Tasks, Health and Watchdog
static const LevelModule *const ENABLED_LEVELS[] = {
    &LEVEL_01,
};

void setup() {
  Serial.begin(115200);
  delay(300);
  g_state.boot_ms = millis();
  lightStart();     // core light arbiter: Safe heartbeat from the first second
  buzzerStart();    // core buzzer arbiter: Fire, Panic, beeps

  for (const LevelModule *lv : ENABLED_LEVELS) {
    Serial.printf("[STATUS] starting %s\n", lv->name);
    lv->setup();
  }
  consoleStart();
}

void loop() {
  // All work runs in FreeRTOS tasks created by the levels and the console.
  vTaskDelay(pdMS_TO_TICKS(1000));
}
