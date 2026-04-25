#ifndef AURA_POWER_MANAGER_H
#define AURA_POWER_MANAGER_H

#include <stdint.h>

#include "../types.h"

void power_manager_update(aura_system_state_t *state, uint16_t battery_mv);

#endif