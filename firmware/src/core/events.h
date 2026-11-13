// Core event bus. A level publishes an event; the core prints "[EVENT] <type> <detail>" on the
// Serial Monitor (paper section 6) and calls every subscriber (for example the telemetry sender).
// Handlers must be quick and must not block: they run in the publisher's task.
#pragma once

typedef void (*EventHandler)(const char *type, const char *detail);

void eventSubscribe(EventHandler handler);                      // up to 4 subscribers
void eventPublish(const char *type, const char *detail = "");
