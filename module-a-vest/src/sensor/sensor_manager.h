#ifndef AURA_SENSOR_MANAGER_H
#define AURA_SENSOR_MANAGER_H

#include <stdint.h>

#include "../types.h"

void sensor_manager_tick(aura_system_state_t *state, uint32_t now_ms);

#endif