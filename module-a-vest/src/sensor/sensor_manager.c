#include "sensor_manager.h"

#include "../ble/ble_handlers.h"
#include "../config.h"
#include "../motor/haptic_controller.h"
#include "hcsr04.h"

static const uint8_t g_trigger_offsets[AURA_ZONE_COUNT] = {0U, 33U, 66U};
static const uint8_t g_read_offsets[AURA_ZONE_COUNT] = {5U, 38U, 71U};

static void sensor_manager_store_reading(aura_system_state_t *state, aura_zone_t zone, uint16_t cm) {
    switch (zone) {
        case AURA_ZONE_LEFT:
            state->sensors.left_cm = cm;
            break;
        case AURA_ZONE_CENTER:
            state->sensors.center_cm = cm;
            break;
        case AURA_ZONE_RIGHT:
            state->sensors.right_cm = cm;
            break;
        default:
            break;
    }
}

void sensor_manager_tick(aura_system_state_t *state, uint32_t now_ms) {
    const uint32_t cycle_offset_ms = now_ms % AURA_POLL_CYCLE_MS;
    state->uptime_ms = now_ms;

    for (uint8_t zone = 0; zone < AURA_ZONE_COUNT; ++zone) {
        if (cycle_offset_ms == g_trigger_offsets[zone]) {
            hcsr04_trigger((aura_zone_t)zone);
        }

        if (cycle_offset_ms == g_read_offsets[zone]) {
            sensor_manager_store_reading(
                state,
                (aura_zone_t)zone,
                hcsr04_read_distance_cm((aura_zone_t)zone)
            );
            state->sensors.timestamp_ms = now_ms;
        }
    }

    if (cycle_offset_ms == AURA_NOTIFY_OFFSET_MS) {
        ble_handlers_publish_sensor_data(state);
        haptic_controller_tick(state, now_ms);
    }
}