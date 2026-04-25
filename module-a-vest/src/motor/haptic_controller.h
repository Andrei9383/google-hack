#ifndef AURA_HAPTIC_CONTROLLER_H
#define AURA_HAPTIC_CONTROLLER_H

#include <stdint.h>

#include "../types.h"

void haptic_controller_init(aura_system_state_t *state);
aura_haptic_profile_t haptic_controller_map_distance(uint16_t distance_cm);
void haptic_controller_apply_override(
    aura_system_state_t *state,
    const aura_haptic_override_cmd_t *command,
    uint32_t now_ms
);
void haptic_controller_tick(aura_system_state_t *state, uint32_t now_ms);

#endif