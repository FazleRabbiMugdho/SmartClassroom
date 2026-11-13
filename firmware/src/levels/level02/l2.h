// Level 2 internal header. Not used outside src/levels/level02*.
#pragma once
#include <Arduino.h>

// Team ID: not a secret. Override at build time with -DTEAM_ID=\"T07\" (see platformio.ini).
#ifndef TEAM_ID
#define TEAM_ID "T01"
#endif

String l2DeviceId();     // e.g. "T01-D1"
String l2MdnsName();     // e.g. "smartclass-t01"
String l2ApSsid();       // e.g. "SmartClass-T01"

// ---- settings saved in flash (NVS). Nothing here is written in code or in the repository.
struct L2Settings {
  char ssid[33] = "";
  char pass[65] = "";
  char room[32] = "";
  char token[96] = "";
  char server[128] = "";     // base URL, for example https://my-platform.example.com
  bool verified = false;     // true once a connection with these credentials succeeded
};
extern L2Settings g_l2;
void l2StoreLoad();
void l2StoreSave();
void l2StoreClear();         // clears Wi-Fi details, room, token and server; keeps the seq counter
uint32_t l2NextSeq();        // increases forever, never reused, even after restarts or power cuts

// ---- Wi-Fi manager
void l2NetStart();
void l2NetApplySettings();   // called by the web page after Save
const char *l2NetMode();     // "SETUP" or "STATION"
String l2SetupError();
String l2LocalTime();
void l2ResetAndRestart();    // clear details, restart in setup mode

// ---- web server (local status page and setup page)
void l2WebStart();

// ---- telemetry
void l2TelemetryStart();
void l2OnEvent(const char *type, const char *detail);
