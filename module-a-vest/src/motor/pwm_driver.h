#ifndef AURA_PWM_DRIVER_H
#define AURA_PWM_DRIVER_H

#include <stdint.h>

#include "../types.h"

void pwm_driver_init(void);
void pwm_driver_set_duty(aura_zone_t zone, uint8_t duty_cycle);
uint8_t pwm_driver_get_duty(aura_zone_t zone);

#endif