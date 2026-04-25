#include "ble_handlers.h"

#include "ble_payload.h"
#include "../motor/haptic_controller.h"

void ble_handlers_init(aura_system_state_t *state) {
    state->ble_connected = false;
    state->sensor_notify_enabled = false;
    state->last_sensor_payload[0] = 0xFFU;
    state->last_sensor_payload[1] = 0xFFU;
    state->last_sensor_payload[2] = 0xFFU;
    state->last_status_payload[0] = 0x00U;
}

void ble_handlers_set_connected(aura_system_state_t *state, bool connected) {
    state->ble_connected = connected;
}

void ble_handlers_set_notify_enabled(aura_system_state_t *state, bool enabled) {
    state->sensor_notify_enabled = enabled;
}

void ble_handlers_publish_sensor_data(aura_system_state_t *state) {
    if (!state->sensor_notify_enabled) {
        return;
    }

    ble_payload_encode_sensor(&state->sensors, state->last_sensor_payload);
}

void ble_handlers_publish_status(aura_system_state_t *state, uint8_t status_code) {
    ble_payload_encode_status(status_code, state->last_status_payload);
}

bool ble_handlers_receive_override(
    aura_system_state_t *state,
    const uint8_t *payload,
    size_t payload_length,
    uint32_t now_ms
) {
    aura_haptic_override_cmd_t command;

    if (!ble_payload_decode_override(payload, payload_length, &command)) {
        return false;
    }

    haptic_controller_apply_override(state, &command, now_ms);
    return true;
}