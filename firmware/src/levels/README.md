# Level modules

One file pair per level. Levels 1, 2 and 3 are built so far.

| Level | File | Status |
|---|---|---|
| 1 Dual-core tasks, health, watchdog | `level01.h`, `level01.cpp` | Implemented (checklist A1, A2, L1 items); compiled, not run on hardware |
| 2 Wi-Fi setup and secure telemetry | `level02.h`, `level02.cpp`, `level02/` | Implemented (checklist A3, A4, A6, L2 items); compiled, not run on hardware |
| 3 Heat, fire, panic, fail-safe door | `level03.h`, `level03.cpp`, `level03/` | Implemented (checklist A5, A6, A7, L3 items); compiled, rules host-tested, not run on hardware |
| 4–12 | — | Not started |

## Core services every level uses (`../core/`)

| Service | Use it for |
|---|---|
| `shared.h` | Shared values. Add a field only when two levels need it. Lock with `STATE_LOCK()` / `STATE_UNLOCK()` |
| `light.h` | The RGB LED. Call `lightSet(LS_..., true/false)`; the arbiter shows the highest-priority state |
| `events.h` | `eventPublish("TYPE", "detail")` prints `[EVENT] ...` and passes it to subscribers (Level 2 sends it to the platform) |
| `buzzer.h` | The buzzer. `buzzerSet(LS_FIRE / LS_PANIC / LS_HEAT_DANGER, on)` for continuous patterns, `buzzerBeeps(n)` for one-shot beeps (granted 1, denied 2, weather 3) |
| `extras.h` | `extraSet("key", "Label", "value")` adds a card to the local status page. Key `alert` is the red banner, `notice` the amber line |
| `console.h` | `consoleRegisterCommand("name", handler)` adds a serial command; `[STATUS]` fields that a level fills are read from `shared.h` |
| `level02.h` | `level02Request("GET"/"POST", path, body, &response)` talks to the platform with the device token (HTTPS, checked certificate) |

How later levels attach, using Level 3 as the model:
- Level 3 shows fire with `lightSet(LS_FIRE, true)`, `buzzerSet(LS_FIRE, true)` and `eventPublish("FIRE", ...)`; the local page banner comes from `extraSet("alert", ...)`.
- **Level 4 and later must not lock or unlock the door while `g_state.fire_active` is true.** Fire overrides every other door rule.
- Level 5 changes the alarm limits through `g_l3_limits` (`level03/l3.h`). Level 7 reuses `eventPublish("CARD_TAP", ...)` (already published by Level 1) and `buzzerBeeps(...)` for access feedback.
- Level 3 keeps its flash data in its own namespace (`l3`), Level 2 in `fastrobox`, so levels never overwrite each other's settings.

## Rules for adding a level

1. Create `levelNN.h` and `levelNN.cpp`. Expose one `const LevelModule LEVEL_NN` with a name and a `setup` function.
2. Read and write shared values only through `core/shared.h` and the `STATE_LOCK()` / `STATE_UNLOCK()` macros.
3. Do not remove or change what an earlier level prints or does. Later levels extend, not replace (paper section 1).
4. Add the level to `ENABLED_LEVELS` in `src/main.cpp`, in order.
5. Re-run the Level 1 checks in `../../docs/` (checklist) after each change to confirm nothing earlier broke.
