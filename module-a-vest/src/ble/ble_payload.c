#include "ble_payload.h"

void ble_payload_encode_sensor(const aura_sensor_reading_t *reading, uint8_t out_payload[3]) {
    out_payload[0] = reading->left_cm > 255U ? 0xFFU : (uint8_t)reading->left_cm;
    out_payload[1] = reading->center_cm > 255U ? 0xFFU : (uint8_t)reading->center_cm;
    out_payload[2] = reading->right_cm > 255U ? 0xFFU : (uint8_t)reading->right_cm;
}

void ble_payload_encode_status(uint8_t status_code, uint8_t out_payload[1]) {
    out_payload[0] = status_code;
}

bool ble_payload_decode_override(
    const uint8_t *payload,
    size_t payload_length,
    aura_haptic_override_cmd_t *out_command
) {
    if (payload == 0 || out_command == 0 || payload_length != 3U) {
        return false;
    }

    out_command->motor_id = payload[0];
    out_command->intensity = payload[1];
    out_command->pattern = payload[2];
    return true;
}