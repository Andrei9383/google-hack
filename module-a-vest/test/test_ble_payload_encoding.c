#include <assert.h>
#include <stdbool.h>

#include "../src/ble/ble_payload.h"

void test_ble_payload_encoding(void) {
    aura_sensor_reading_t reading = {320U, 100U, 45U, 0U};
    uint8_t sensor_payload[3];
    aura_haptic_override_cmd_t command;
    const uint8_t override_payload[3] = {0x02U, 0xB0U, 0x01U};

    ble_payload_encode_sensor(&reading, sensor_payload);
    assert(sensor_payload[0] == 0xFFU);
    assert(sensor_payload[1] == 100U);
    assert(sensor_payload[2] == 45U);

    assert(ble_payload_decode_override(override_payload, 3U, &command) == true);
    assert(command.motor_id == 0x02U);
    assert(command.intensity == 0xB0U);
    assert(command.pattern == 0x01U);
}