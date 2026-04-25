#include <assert.h>

#include "../src/motor/haptic_controller.h"

void test_haptic_mapping(void) {
    aura_haptic_profile_t clear = haptic_controller_map_distance(250U);
    aura_haptic_profile_t approaching = haptic_controller_map_distance(175U);
    aura_haptic_profile_t near = haptic_controller_map_distance(90U);
    aura_haptic_profile_t danger = haptic_controller_map_distance(10U);

    assert(clear.intensity == 0U);
    assert(clear.pattern == AURA_PATTERN_NONE);

    assert(approaching.intensity == 38U);
    assert(approaching.pattern == AURA_PATTERN_PULSE_1HZ);

    assert(near.intensity == 166U);
    assert(near.pattern == AURA_PATTERN_PULSE_4HZ);

    assert(danger.intensity == 255U);
    assert(danger.pattern == AURA_PATTERN_CONTINUOUS);
}