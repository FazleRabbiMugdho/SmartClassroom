// Core console: prints [STATUS] once per second and handles serial commands.
// Fields for levels that are not built yet print as "-" (paper section 5.1).
#include <Arduino.h>
#include "core/tasks.h"
#include <esp_task_wdt.h>
#include "core/console.h"
#include "core/shared.h"

static volatile bool g_hang = false;
static TaskHandle_t h_console = nullptr;

struct Cmd { const char *name; ConsoleHandler fn; };
static Cmd g_cmds[8];
static uint8_t g_cmd_count = 0;

bool consoleHangRequested() { return g_hang; }

void consoleRegisterCommand(const char *name, ConsoleHandler handler) {
  if (g_cmd_count < 8) g_cmds[g_cmd_count++] = {name, handler};
}

static void printHelp() {
  String s = "[CMD] help | status | health | tasks | ver | hang";
  for (uint8_t i = 0; i < g_cmd_count; i++) { s += " | "; s += g_cmds[i].name; }
  Serial.println(s);
}

static void printStatus() {
  float t, h, hi;
  bool flame, door, rssi_ok;
  int rssi;
  char st[8], trend[8];
  STATE_LOCK();
  t = g_state.tempC; h = g_state.rh; flame = g_state.flame; door = g_state.door_unlocked;
  rssi_ok = g_state.rssi_valid; rssi = g_state.rssi; hi = g_state.heat_index_c;
  strcpy(st, g_state.status); strcpy(trend, g_state.heat_trend);
  STATE_UNLOCK();
  char tbuf[12], hbuf[12], rbuf[12], hibuf[12];
  if (isnan(hi)) strcpy(hibuf, "-"); else snprintf(hibuf, sizeof(hibuf), "%.1fC", hi);
  if (rssi_ok) snprintf(rbuf, sizeof(rbuf), "%d", rssi); else strcpy(rbuf, "-");
  if (isnan(t)) strcpy(tbuf, "-"); else snprintf(tbuf, sizeof(tbuf), "%.1fC", t);
  if (isnan(h)) strcpy(hbuf, "-"); else snprintf(hbuf, sizeof(hbuf), "%d%%", (int)h);
  Serial.printf("[STATUS] up=%lus T=%s RH=%s HI=%s flame=%d door=%s state=%s trend=%s rssi=%s heap=%uk psram=%uk chip=%.1fC fw=%s\n",
                (unsigned long)((millis() - g_state.boot_ms) / 1000),
                tbuf, hbuf, hibuf,
                flame ? 1 : 0, door ? "UNLOCKED" : "LOCKED", st, trend, rbuf,
                (unsigned)(ESP.getFreeHeap() / 1024), (unsigned)(ESP.getFreePsram() / 1024),
                temperatureRead(), FW_VERSION);
}

static void handleCommand(String cmd) {
  cmd.trim();
  if (cmd == "help") printHelp();
  else if (cmd == "status") printStatus();
  else if (cmd == "health") {
    Serial.printf("[CMD] chip=%.1fC heap=%uk psram=%uk flash=%uMB cpu=%luMHz uptime=%lus reset=%s fw=%s\n",
                  temperatureRead(), (unsigned)(ESP.getFreeHeap() / 1024), (unsigned)(ESP.getFreePsram() / 1024),
                  (unsigned)(ESP.getFlashChipSize() / (1024 * 1024)), (unsigned long)getCpuFrequencyMhz(),
                  (unsigned long)((millis() - g_state.boot_ms) / 1000), g_state.reset_reason, FW_VERSION);
  } else if (cmd == "ver") {
    Serial.printf("[CMD] fw=%s build=%s\n", FW_VERSION, BUILD_DATE);
  } else if (cmd == "tasks") {
    coreTasksPrint();       // every task, its core, priority and free stack
  } else if (cmd == "hang") {
    Serial.println("[CMD] hanging the console task to test the watchdog");
    g_hang = true;
  } else if (cmd.length()) {
    // Commands registered by levels (for example "reset" from Level 2).
    int sp = cmd.indexOf(' ');
    String name = sp < 0 ? cmd : cmd.substring(0, sp);
    String args = sp < 0 ? String("") : cmd.substring(sp + 1);
    for (uint8_t i = 0; i < g_cmd_count; i++) {
      if (name == g_cmds[i].name) { g_cmds[i].fn(args.c_str()); return; }
    }
    Serial.printf("[CMD] unknown command: %s (type help)\n", cmd.c_str());
  }
}

static void consoleTask(void *) {
  esp_task_wdt_add(nullptr);
  uint32_t last = 0;
  String line;
  for (;;) {
    if (g_hang) {
      for (;;) { }       // deliberate freeze: no watchdog feed, board restarts
    }
    esp_task_wdt_reset();
    while (Serial.available()) {
      char c = Serial.read();
      if (c == '\n') { handleCommand(line); line = ""; }
      else if (c != '\r') line += c;
    }
    if (millis() - last >= 1000) {
      last = millis();
      printStatus();
    }
    vTaskDelay(pdMS_TO_TICKS(20));
  }
}

void consoleStart() {
  printHelp();
  coreTaskCreate(consoleTask, "console", 6144, nullptr, 1, &h_console, 0);
}
