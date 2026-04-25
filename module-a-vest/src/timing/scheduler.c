#include "scheduler.h"

#include "../power/power_manager.h"
#include "../sensor/sensor_manager.h"

void scheduler_step(aura_system_state_t *state, uint32_t now_ms) {
    sensor_manager_tick(state, now_ms);
    power_manager_update(state, state->battery_mv);
}