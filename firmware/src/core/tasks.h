// Core task registry. Every FreeRTOS task is created through coreTaskCreate(), a drop-in replacement
// for xTaskCreatePinnedToCore(), so the serial command "tasks" can list each task with its core and
// free stack (paper section 5.2, Level 1: "Each running task with its CPU core and its free stack").
#pragma once
#include <Arduino.h>

BaseType_t coreTaskCreate(TaskFunction_t fn, const char *name, uint32_t stack, void *param,
                          UBaseType_t priority, TaskHandle_t *handle, BaseType_t core);

// Prints one [CMD] line per registered task.
void coreTasksPrint();
