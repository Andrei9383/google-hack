#ifndef AURA_SCHEDULER_H
#define AURA_SCHEDULER_H

#include <stdint.h>

#include "../types.h"

void scheduler_step(aura_system_state_t *state, uint32_t now_ms);

#endif