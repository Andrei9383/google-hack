#include "haptic_controller.h"

#include "../config.h"
#include "haptic_patterns.h"
#include "pwm_driver.h"

static aura_zone_t motor_id_to_zone(uint8_t motor_id) {
    switch (motor_id) {
        case 0x01U:
            return AURA_ZONE_LEFT;
        case 0x02U:
            return AURA_ZONE_CENTER;
        case 0x03U:
        default:
            return AURA_ZONE_RIGHT;
    }
}

static aura_haptic_profile_t profile_from_override(const aura_haptic_override_cmd_t *command) {
    aura_haptic_profile_t profile = {command->intensity, AURA_PATTERN_CONTINUOUS};

    switch (command->pattern) {
        case 0x00U:
            profile.pattern = AURA_PATTERN_CONTINUOUS;
            break;
        case 0x01U:
            profile.pattern = AURA_PATTERN_OVERRIDE_HEARTBEAT;
            break;
        case 0x02U:
            profile.pattern = AURA_PATTERN_CONTINUOUS;
            break;
        default:
            profile.pattern = AURA_PATTERN_SYSTEM_PULSE;
            break;
    }

    return profile;
}

static uint16_t zone_distance(const aura_sensor_reading_t *sensors, aura_zone_t zone) {
    switch (zone) {
        case AURA_ZONE_LEFT:
            return sensors->left_cm;
        case AURA_ZONE_CENTER:
            return sensors->center_cm;
        case AURA_ZONE_RIGHT:
        default:
            return sensors->right_cm;
    }
}

void haptic_controller_init(aura_system_state_t *state) {
    for (uint8_t zone = 0; zone < AURA_ZONE_COUNT; ++zone) {
        state->motors[zone].active_profile.intensity = 0U;
        state->motors[zone].active_profile.pattern = AURA_PATTERN_NONE;
        state->motors[zone].override_profile = state->motors[zone].active_profile;
        state->motors[zone].current_duty = 0U;
        state->motors[zone].override_active = false;
        state->motors[zone].override_expires_at_ms = 0U;
    }
}

aura_haptic_profile_t haptic_controller_map_distance(uint16_t distance_cm) {
    if (distance_cm > AURA_DISTANCE_CLEAR_CM) {
        return (aura_haptic_profile_t){0U, AURA_PATTERN_NONE};
    }

    if (distance_cm >= AURA_DISTANCE_APPROACHING_CM) {
        return (aura_haptic_profile_t){38U, AURA_PATTERN_PULSE_1HZ};
    }

    if (distance_cm >= AURA_DISTANCE_NEAR_CM) {
        return (aura_haptic_profile_t){89U, AURA_PATTERN_PULSE_2HZ};
    }

    if (distance_cm >= AURA_DISTANCE_VERY_NEAR_CM) {
        return (aura_haptic_profile_t){166U, AURA_PATTERN_PULSE_4HZ};
    }

    if (distance_cm >= AURA_DISTANCE_DANGER_CM) {
        return (aura_haptic_profile_t){230U, AURA_PATTERN_PULSE_8HZ};
    }

    return (aura_haptic_profile_t){255U, AURA_PATTERN_CONTINUOUS};
}

void haptic_controller_apply_override(
    aura_system_state_t *state,
    const aura_haptic_override_cmd_t *command,
    uint32_t now_ms
) {
    if (command->motor_id == 0xFFU) {
        for (uint8_t zone = 0; zone < AURA_ZONE_COUNT; ++zone) {
            state->motors[zone].override_active = true;
            state->motors[zone].override_profile = profile_from_override(command);
            state->motors[zone].override_expires_at_ms = now_ms + AURA_OVERRIDE_DURATION_MS;
        }
        return;
    }

    const aura_zone_t zone = motor_id_to_zone(command->motor_id);
    state->motors[zone].override_active = true;
    state->motors[zone].override_profile = profile_from_override(command);
    state->motors[zone].override_expires_at_ms = now_ms + AURA_OVERRIDE_DURATION_MS;
}

void haptic_controller_tick(aura_system_state_t *state, uint32_t now_ms) {
    for (uint8_t zone = 0; zone < AURA_ZONE_COUNT; ++zone) {
        aura_motor_state_t *motor = &state->motors[zone];

        if (motor->override_active && now_ms >= motor->override_expires_at_ms) {
            motor->override_active = false;
        }

        if (motor->override_active) {
            motor->active_profile = motor->override_profile;
        } else {
            motor->active_profile = haptic_controller_map_distance(
                zone_distance(&state->sensors, (aura_zone_t)zone)
            );
        }

        motor->current_duty = haptic_patterns_sample(
            motor->active_profile.pattern,
            motor->active_profile.intensity,
            now_ms
        );
        pwm_driver_set_duty((aura_zone_t)zone, motor->current_duty);
    }
}