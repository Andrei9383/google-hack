cmake_minimum_required(VERSION 3.20)

project(aura_vest C)

set(CMAKE_C_STANDARD 11)

add_library(aura_vest_logic STATIC
    src/system_init.c
    src/sensor/hcsr04.c
    src/sensor/sensor_manager.c
    src/motor/pwm_driver.c
    src/motor/haptic_patterns.c
    src/motor/haptic_controller.c
    src/ble/ble_payload.c
    src/ble/ble_handlers.c
    src/ble/ble_init.c
    src/power/battery_adc.c
    src/power/power_manager.c
    src/timing/scheduler.c
)

target_include_directories(aura_vest_logic PUBLIC src)