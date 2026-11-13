// Definitions for the shared state declared in core/shared.h.
#include "core/shared.h"

SharedState g_state;
portMUX_TYPE g_state_mux = portMUX_INITIALIZER_UNLOCKED;
