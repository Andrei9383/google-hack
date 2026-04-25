#ifndef AURA_HAPTIC_PATTERNS_H
#define AURA_HAPTIC_PATTERNS_H

#include <stdint.h>

#include "../types.h"

uint8_t haptic_patterns_sample(aura_pattern_t pattern, uint8_t intensity, uint32_t elapsed_ms);

#endif