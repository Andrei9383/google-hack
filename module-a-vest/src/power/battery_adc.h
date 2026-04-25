#ifndef AURA_BATTERY_ADC_H
#define AURA_BATTERY_ADC_H

#include <stdint.h>

uint8_t battery_adc_percent_from_mv(uint16_t millivolts);

#endif