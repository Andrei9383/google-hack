#include "haptic_patterns.h"

static uint8_t pulse(uint8_t intensity, uint32_t elapsed_ms, uint32_t period_ms, uint32_t on_ms) {
    const uint32_t phase = elapsed_ms % period_ms;
    return phase < on_ms ? intensity : 0U;
}

uint8_t haptic_patterns_sample(aura_pattern_t pattern, uint8_t intensity, uint32_t elapsed_ms) {
    switch (pattern) {
        case AURA_PATTERN_NONE:
            return 0U;
        case AURA_PATTERN_CONTINUOUS:
            return intensity;
        case AURA_PATTERN_PULSE_1HZ:
            return pulse(intensity, elapsed_ms, 1000U, 500U);
        case AURA_PATTERN_PULSE_2HZ:
            return pulse(intensity, elapsed_ms, 500U, 250U);
        case AURA_PATTERN_PULSE_4HZ:
            return pulse(intensity, elapsed_ms, 250U, 125U);
        case AURA_PATTERN_PULSE_8HZ:
            return pulse(intensity, elapsed_ms, 125U, 62U);
        case AURA_PATTERN_OVERRIDE_HEARTBEAT: {
            const uint32_t phase = elapsed_ms % 1000U;
            if ((phase < 200U) || (phase >= 300U && phase < 500U)) {
                return intensity;
            }
            return 0U;
        }
        case AURA_PATTERN_SYSTEM_PULSE:
            return pulse(intensity, elapsed_ms, 600U, 100U);
        default:
            return 0U;
    }
}