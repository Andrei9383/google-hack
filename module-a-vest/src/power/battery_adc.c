#include "battery_adc.h"

uint8_t battery_adc_percent_from_mv(uint16_t millivolts) {
    if (millivolts <= 3300U) {
        return 0U;
    }

    if (millivolts >= 4200U) {
        return 100U;
    }

    return (uint8_t)(((millivolts - 3300U) * 100U) / 900U);
}