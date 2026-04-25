#include <assert.h>

#include "../src/ble/ble_handlers.h"
#include "../src/motor/haptic_controller.h"
#include "../src/motor/pwm_driver.h"
#include "../src/system_init.h"

void test_override_state(void) {
    aura_system_state_t state;
    const uint8_t override_payload[3] = {0x02U, 0xFFU, 0x01U};

    aura_system_init(&state);
    state.sensors.center_cm = 250U;
    ble_handlers_set_notify_enabled(&state, true);

    assert(ble_handlers_receive_override(&state, override_payload, 3U, 1000U) == true);
    haptic_controller_tick(&state, 1100U);
    assert(pwm_driver_get_duty(AURA_ZONE_CENTER) == 255U);

    haptic_controller_tick(&state, 3200U);
    assert(pwm_driver_get_duty(AURA_ZONE_CENTER) == 0U);
}