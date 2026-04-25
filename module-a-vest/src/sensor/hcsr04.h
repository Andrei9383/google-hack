#ifndef AURA_HCSR04_H
#define AURA_HCSR04_H

#include <stdint.h>

#include "../types.h"

void hcsr04_init(void);
void hcsr04_trigger(aura_zone_t zone);
void hcsr04_set_mock_distance(aura_zone_t zone, uint16_t distance_cm);
uint16_t hcsr04_read_distance_cm(aura_zone_t zone);
uint16_t hcsr04_convert_pulse_to_cm(uint32_t pulse_width_us);

#endif