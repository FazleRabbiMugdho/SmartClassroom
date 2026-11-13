// Core console: [STATUS] line, serial commands, and the hang test. Used by every level.
#pragma once

// Call once in setup() after the levels are started.
void consoleStart();

// A level adds its own serial command (for example Level 2 adds "reset"). Up to 8 extra commands.
// The handler receives the text after the command name. "help" lists registered commands.
typedef void (*ConsoleHandler)(const char *args);
void consoleRegisterCommand(const char *name, ConsoleHandler handler);

// Set by the "hang" command; the console task then stops feeding the watchdog.
bool consoleHangRequested();
