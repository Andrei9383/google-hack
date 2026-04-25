#ifndef AURA_BLE_PAYLOAD_H
#define AURA_BLE_PAYLOAD_H

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#include "../types.h"

void ble_payload_encode_sensor(const aura_sensor_reading_t *reading, uint8_t out_payload[3]);
void ble_payload_encode_status(uint8_t status_code, uint8_t out_payload[1]);
bool ble_payload_decode_override(
    const uint8_t *payload,
    size_t payload_length,
    aura_haptic_override_cmd_t *out_command
);

#endif