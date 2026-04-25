#include <assert.h>

#include "../src/sensor/hcsr04.h"

void test_distance_conversion(void) {
    assert(hcsr04_convert_pulse_to_cm(58U) == 2U);
    assert(hcsr04_convert_pulse_to_cm(1740U) == 30U);
    assert(hcsr04_convert_pulse_to_cm(5800U) == 100U);
    assert(hcsr04_convert_pulse_to_cm(580000U) == 400U);
}