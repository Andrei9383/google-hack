#include <assert.h>

#include "../src/config.h"
#include "../src/motor/haptic_controller.h"
#include "../src/motor/pwm_driver.h"
#include "../src/system_init.h"

static uint8_t expected_dc_motor_duty(uint8_t requested_duty) {
    if (requested_duty == 0U) {
        return 0U;
    }

    return (uint8_t)(AURA_DC_MOTOR_MIN_EFFECTIVE_DUTY +
        (((uint16_t)(255U - AURA_DC_MOTOR_MIN_EFFECTIVE_DUTY) * requested_duty) / 255U));
}

void test_dc_motor_output(void) {
    aura_system_state_t state;

    aura_system_init(&state);

    state.sensors.left_cm = 175U;
    haptic_controller_tick(&state, 0U);
    assert(pwm_driver_get_duty(AURA_ZONE_LEFT) == expected_dc_motor_duty(38U));

    state.sensors.left_cm = 250U;
    haptic_controller_tick(&state, 0U);
    assert(pwm_driver_get_duty(AURA_ZONE_LEFT) == 0U);
}