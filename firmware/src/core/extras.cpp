#include <Arduino.h>
#include "core/extras.h"

struct Extra { char key[16]; char label[32]; char value[64]; bool used; };
static Extra g_ex[24];
static portMUX_TYPE g_exmux = portMUX_INITIALIZER_UNLOCKED;

static void copy(char *dst, const char *src, size_t n) { strncpy(dst, src, n - 1); dst[n - 1] = 0; }

void extraSet(const char *key, const char *label, const char *value) {
  portENTER_CRITICAL(&g_exmux);
  Extra *slot = nullptr;
  for (auto &e : g_ex) {
    if (e.used && strcmp(e.key, key) == 0) { slot = &e; break; }
    if (!e.used && !slot) slot = &e;
  }
  if (slot) {
    slot->used = true;
    copy(slot->key, key, sizeof(slot->key));
    copy(slot->label, label, sizeof(slot->label));
    copy(slot->value, value, sizeof(slot->value));
  }
  portEXIT_CRITICAL(&g_exmux);
}

static void esc(String &out, const char *s) {
  for (; *s; s++) {
    if (*s == '"' || *s == '\\') { out += '\\'; out += *s; }
    else if ((uint8_t)*s >= 32) out += *s;
  }
}

String extrasJson() {
  Extra copyOf[24];
  portENTER_CRITICAL(&g_exmux);
  memcpy(copyOf, g_ex, sizeof(g_ex));
  portEXIT_CRITICAL(&g_exmux);
  String j = "[";
  bool first = true;
  for (auto &e : copyOf) {
    if (!e.used || !e.value[0]) continue;
    if (!first) j += ",";
    first = false;
    j += "{\"k\":\""; esc(j, e.key); j += "\",\"l\":\""; esc(j, e.label); j += "\",\"v\":\""; esc(j, e.value); j += "\"}";
  }
  j += "]";
  return j;
}
