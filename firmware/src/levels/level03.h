// Level 3: heat, fire, panic and fail-safe door (paper section 8, Level 3; checklist A5, A6, A7, L3 items).
// Built strictly on top of Levels 1 and 2. It reads Level 1's sensor values from core/shared.h and
// uses only the core services (light, buzzer, events, extras, console) plus level02Request() to
// receive "Reset fire" from the platform. It does not edit Level 1 or Level 2 code.
#pragma once
#include "levels/level.h"

extern const LevelModule LEVEL_03;
