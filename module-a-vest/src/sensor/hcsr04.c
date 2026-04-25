#include "hcsr04.h"

#include "../config.h"

static uint16_t g_mock_distances[AURA_ZONE_COUNT];

void hcsr04_init(void) {
    for (uint8_t zone = 0; zone < AURA_ZONE_COUNT; ++zone) {
        g_mock_distances[zone] = 0xFFU;
    }
}

void hcsr04_trigger(aura_zone_t zone) {
    (void)zone;
}

void hcsr04_set_mock_distance(aura_zone_t zone, uint16_t distance_cm) {
    if (distance_cm > AURA_DISTANCE_MAX_CM) {
        distance_cm = AURA_DISTANCE_MAX_CM;
    }

    g_mock_distances[zone] = distance_cm;
}

uint16_t hcsr04_read_distance_cm(aura_zone_t zone) {
    return g_mock_distances[zone];
}

uint16_t hcsr04_convert_pulse_to_cm(uint32_t pulse_width_us) {
    uint16_t distance_cm = (uint16_t)(pulse_width_us / 58U);

    if (distance_cm < 2U) {
        return 2U;
    }

    if (distance_cm > AURA_DISTANCE_MAX_CM) {
        return AURA_DISTANCE_MAX_CM;
    }

    return distance_cm;
}