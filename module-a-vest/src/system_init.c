#include "system_init.h"

#include <string.h>

#include "ble/ble_handlers.h"
#include "motor/haptic_controller.h"
#include "motor/pwm_driver.h"
#include "power/power_manager.h"
#include "sensor/hcsr04.h"

void aura_system_init(aura_system_state_t *state) {
    memset(state, 0, sizeof(*state));

    state->sensors.left_cm = 0xFFU;
    state->sensors.center_cm = 0xFFU;
    state->sensors.right_cm = 0xFFU;
    state->battery_mv = 3700U;
    state->battery_percent = 50U;

    hcsr04_init();
    pwm_driver_init();
    haptic_controller_init(state);
    ble_handlers_init(state);
    power_manager_update(state, state->battery_mv);
}