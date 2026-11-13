#include <Arduino.h>
#include "core/tasks.h"

struct TaskInfo { const char *name; TaskHandle_t handle; };
static TaskInfo g_tasks[24];
static uint8_t g_task_count = 0;
static portMUX_TYPE g_tasks_mux = portMUX_INITIALIZER_UNLOCKED;

BaseType_t coreTaskCreate(TaskFunction_t fn, const char *name, uint32_t stack, void *param,
                          UBaseType_t priority, TaskHandle_t *handle, BaseType_t core) {
  TaskHandle_t h = nullptr;
  BaseType_t ok = xTaskCreatePinnedToCore(fn, name, stack, param, priority, &h, core);
  if (ok == pdPASS) {
    portENTER_CRITICAL(&g_tasks_mux);
    if (g_task_count < 24) g_tasks[g_task_count++] = {name, h};
    portEXIT_CRITICAL(&g_tasks_mux);
  }
  if (handle) *handle = h;
  return ok;
}

void coreTasksPrint() {
  Serial.printf("[CMD] %u tasks\n", g_task_count);
  for (uint8_t i = 0; i < g_task_count; i++) {
    Serial.printf("[CMD] %-8s core=%d priority=%u stack_free=%u words\n", g_tasks[i].name,
                  (int)xTaskGetAffinity(g_tasks[i].handle), (unsigned)uxTaskPriorityGet(g_tasks[i].handle),
                  (unsigned)uxTaskGetStackHighWaterMark(g_tasks[i].handle));
  }
}
