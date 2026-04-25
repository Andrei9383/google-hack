#include "power_manager.h"

#include "../ble/ble_handlers.h"
#include "../config.h"
#include "battery_adc.h"

void power_manager_update(aura_system_state_t *state, uint16_t battery_mv) {
    state->battery_mv = battery_mv;
    state->battery_percent = battery_adc_percent_from_mv(battery_mv);

    if (state->sensor_fault_mask != 0U) {
        state->status_code = AURA_STATUS_SENSOR_FAULT;
    } else if (state->battery_percent < AURA_BATTERY_CRITICAL_PERCENT) {
        state->status_code = AURA_STATUS_CRITICAL_BATTERY;
    } else if (state->battery_percent < AURA_BATTERY_LOW_PERCENT) {
        state->status_code = AURA_STATUS_LOW_BATTERY;
    } else {
        state->status_code = AURA_STATUS_OK;
    }

    ble_handlers_publish_status(state, state->status_code);
}