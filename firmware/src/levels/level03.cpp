// Level 3 — heat, fire, panic and fail-safe door. Glue only: starts the Level 3 parts.
#include <Arduino.h>
#include "levels/level03.h"
#include "levels/level03/l3.h"

static void setup03() {
  l3FireStart();    // loads the fire latch first, so a latched fire keeps the door UNLOCKED
  l3HeatStart();
}

const LevelModule LEVEL_03 = {"L03 Heat, fire, panic and fail-safe door", setup03};
