#include "pwm_driver.h"

#include "../config.h"

static uint8_t g_pwm_duty[AURA_ZONE_COUNT];

static uint8_t pwm_driver_compensate_duty(uint8_t duty_cycle) {
    if (duty_cycle == 0U) {
        return 0U;
    }

    return (uint8_t)(AURA_DC_MOTOR_MIN_EFFECTIVE_DUTY +
        (((uint16_t)(255U - AURA_DC_MOTOR_MIN_EFFECTIVE_DUTY) * duty_cycle) / 255U));
}

void pwm_driver_init(void) {
    for (uint8_t zone = 0; zone < AURA_ZONE_COUNT; ++zone) {
        g_pwm_duty[zone] = 0U;
    }
}

void pwm_driver_set_duty(aura_zone_t zone, uint8_t duty_cycle) {
    g_pwm_duty[zone] = pwm_driver_compensate_duty(duty_cycle);
}

uint8_t pwm_driver_get_duty(aura_zone_t zone) {
    return g_pwm_duty[zone];
}