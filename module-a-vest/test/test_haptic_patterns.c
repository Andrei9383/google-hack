#include <assert.h>

#include "../src/motor/haptic_patterns.h"

void test_haptic_patterns(void) {
    assert(haptic_patterns_sample(AURA_PATTERN_PULSE_1HZ, 100U, 0U) == 100U);
    assert(haptic_patterns_sample(AURA_PATTERN_PULSE_1HZ, 100U, 750U) == 0U);

    assert(haptic_patterns_sample(AURA_PATTERN_OVERRIDE_HEARTBEAT, 180U, 100U) == 180U);
    assert(haptic_patterns_sample(AURA_PATTERN_OVERRIDE_HEARTBEAT, 180U, 250U) == 0U);
    assert(haptic_patterns_sample(AURA_PATTERN_OVERRIDE_HEARTBEAT, 180U, 400U) == 180U);
}