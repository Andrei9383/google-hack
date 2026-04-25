#ifndef AURA_BLE_HANDLERS_H
#define AURA_BLE_HANDLERS_H

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#include "../types.h"

void ble_handlers_init(aura_system_state_t *state);
void ble_handlers_set_connected(aura_system_state_t *state, bool connected);
void ble_handlers_set_notify_enabled(aura_system_state_t *state, bool enabled);
void ble_handlers_publish_sensor_data(aura_system_state_t *state);
void ble_handlers_publish_status(aura_system_state_t *state, uint8_t status_code);
bool ble_handlers_receive_override(
    aura_system_state_t *state,
    const uint8_t *payload,
    size_t payload_length,
    uint32_t now_ms
);

#endif