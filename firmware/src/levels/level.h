// Common interface for every level module.
// Each level lives in its own file pair (levelNN.h / levelNN.cpp) and only talks to the rest
// through core/shared.h. Levels are started in order from main.cpp, so a later level can rely on
// the ones before it, but never removes what an earlier level built (paper section 1).
#pragma once

struct LevelModule {
  const char *name;      // e.g. "L01 Dual-core, health, watchdog"
  void (*setup)();       // called once from setup(); creates tasks, configures pins
};
