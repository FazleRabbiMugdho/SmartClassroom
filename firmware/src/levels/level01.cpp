// Level 1 — dual-core tasks, 2 Hz heartbeat, sensor reads, sensor-error detection,
// watchdog, BOOT reason, start-up door state.
// Checklist rows covered: A1 (2 Hz light, [CARD] lines, health, tasks), A2 (hang -> WATCHDOG, door LOCKED).
// Status: UNVERIFIED on hardware. Flame polarity and the RGB LED GPIO are assumptions until tested.
#include <Arduino.h>
#include "core/tasks.h"
#include <SPI.h>
#include <MFRC522.h>
#include <DHTesp.h>
#include <esp_system.h>
#include <esp32-hal-rgb-led.h>
#include <esp_task_wdt.h>
#include "pins.h"
#include "core/shared.h"
#include "core/light.h"
#include "core/events.h"
#include "levels/level01.h"

constexpr int FLAME_ACTIVE_LEVEL = LOW;   // UNVERIFIED: most IR modules pull DO LOW on flame

constexpr uint32_t DHT_PERIOD_MS = 5000;
constexpr uint32_t FLAME_PERIOD_MS = 100;
constexpr uint32_t RFID_PERIOD_MS = 200;
constexpr uint32_t DHT_ERROR_MS = 12000;
constexpr uint32_t RFID_ERROR_MS = 3000;
constexpr uint32_t WDT_TIMEOUT_S = 10;

static MFRC522 rfid(PIN_RC522_SS, PIN_RC522_RST);
static DHTesp dht;
static TaskHandle_t h_sensor = nullptr;

static const char *resetReasonName() {
  switch (esp_reset_reason()) {
    case ESP_RST_POWERON: return "POWER_ON";
    case ESP_RST_SW: return "SOFTWARE";
    case ESP_RST_TASK_WDT:
    case ESP_RST_WDT: return "WATCHDOG";
    case ESP_RST_PANIC: return "CRASH";
    case ESP_RST_BROWNOUT: return "BROWNOUT";
    default: return "POWER_ON";
  }
}

// ---- sensor task (core 1): DHT11 every 5 s, flame every 100 ms, RFID every 200 ms
static void sensorTask(void *) {
  esp_task_wdt_add(nullptr);
  uint32_t last_dht = millis() - DHT_PERIOD_MS, last_flame = 0, last_rfid = 0;
  uint32_t dht_fail_since = 0, rfid_fail_since = 0;
  bool dht_err_printed = false, rfid_err_printed = false;
  for (;;) {
    esp_task_wdt_reset();
    uint32_t now = millis();

    if (now - last_flame >= FLAME_PERIOD_MS) {
      last_flame = now;
      bool f = digitalRead(PIN_FLAME_DO) == FLAME_ACTIVE_LEVEL;
      STATE_LOCK(); g_state.flame = f; STATE_UNLOCK();
    }

    if (now - last_dht >= DHT_PERIOD_MS) {
      last_dht = now;
      TempAndHumidity th = dht.getTempAndHumidity();
      float t = th.temperature;
      float h = th.humidity;
      bool ok = dht.getStatus() == DHTesp::ERROR_NONE && !isnan(t) && !isnan(h);
      if (ok) {
        STATE_LOCK();
        g_state.tempC = t; g_state.rh = h; g_state.dht_error = false;
        g_state.dht_read_ms = now;               // when the reading was taken (used for ts in Level 2)
        STATE_UNLOCK();
        dht_fail_since = 0;
        dht_err_printed = false;
      } else if (dht_fail_since == 0) {
        dht_fail_since = now;
      }
    }
    if (dht_fail_since != 0 && now - dht_fail_since >= DHT_ERROR_MS) {
      STATE_LOCK(); g_state.dht_error = true; STATE_UNLOCK();
      if (!dht_err_printed) { Serial.println("[ERROR] SENSOR ERROR: DHT11"); dht_err_printed = true; }
    }

    if (now - last_rfid >= RFID_PERIOD_MS) {
      last_rfid = now;
      byte v = rfid.PCD_ReadRegister(MFRC522::VersionReg);
      bool present = (v != 0x00 && v != 0xFF);
      if (present) {
        rfid_fail_since = 0;
        rfid_err_printed = false;
        STATE_LOCK(); g_state.rfid_error = false; STATE_UNLOCK();
        if (rfid.PICC_IsNewCardPresent() && rfid.PICC_ReadCardSerial()) {
          char uid[32] = "";
          for (byte i = 0; i < rfid.uid.size; i++) {
            char part[4];
            snprintf(part, sizeof(part), "%s%02X", i ? ":" : "", rfid.uid.uidByte[i]);
            strncat(uid, part, sizeof(uid) - strlen(uid) - 1);
          }
          STATE_LOCK();
          strncpy(g_state.last_uid, uid, sizeof(g_state.last_uid) - 1);
          STATE_UNLOCK();
          Serial.printf("[CARD] uid=%s\n", uid);      // one line per tap
          char detail[48];
          snprintf(detail, sizeof(detail), "uid=%s", uid);
          eventPublish("CARD_TAP", detail);           // Level 2 sends it to the platform at once
          rfid.PICC_HaltA();                          // halt stops repeats while the card is held
          rfid.PCD_StopCrypto1();
        }
      } else if (rfid_fail_since == 0) {
        rfid_fail_since = now;
      }
    }
    if (rfid_fail_since != 0 && now - rfid_fail_since >= RFID_ERROR_MS) {
      STATE_LOCK(); g_state.rfid_error = true; STATE_UNLOCK();
      if (!rfid_err_printed) { Serial.println("[ERROR] SENSOR ERROR: RFID"); rfid_err_printed = true; }
    }

    // Light: magenta heartbeat while any sensor error lasts. The core light arbiter draws it
    // (2 Hz green Safe heartbeat is the default), so Level 1 no longer owns the LED.
    bool err;
    STATE_LOCK(); err = g_state.dht_error || g_state.rfid_error; STATE_UNLOCK();
    lightSet(LS_SENSOR_ERROR, err);

    vTaskDelay(pdMS_TO_TICKS(20));
  }
}

static void setup01() {
  pinMode(PIN_FLAME_DO, INPUT);
  pinMode(PIN_BUZZER, OUTPUT);
  digitalWrite(PIN_BUZZER, LOW);

  // Start-up door state (checklist A5 follow-up; paper L1 task 6): flame present = UNLOCKED.
  delay(50);
  bool f = digitalRead(PIN_FLAME_DO) == FLAME_ACTIVE_LEVEL;
  STATE_LOCK(); g_state.flame = f; g_state.door_unlocked = f; STATE_UNLOCK();

  SPI.begin(PIN_RC522_SCK, PIN_RC522_MISO, PIN_RC522_MOSI, PIN_RC522_SS);
  rfid.PCD_Init();
  dht.setup(PIN_DHT_DATA, DHTesp::DHT11);

  g_state.reset_reason = resetReasonName();
  esp_task_wdt_init(WDT_TIMEOUT_S, true);     // a frozen task restarts the board within 10 s

  char boot_detail[40];
  snprintf(boot_detail, sizeof(boot_detail), "reason=%s", g_state.reset_reason);
  eventPublish("BOOT", boot_detail);           // prints "[EVENT] BOOT reason=..." as before
  Serial.printf("[STATUS] door=%s (flame at start-up: %s)\n", f ? "UNLOCKED" : "LOCKED", f ? "yes" : "no");

  coreTaskCreate(sensorTask, "sensor", 6144, nullptr, 2, &h_sensor, 1);
}

const LevelModule LEVEL_01 = {"L01 Dual-core, health, watchdog", setup01};
