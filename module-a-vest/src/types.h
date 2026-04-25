#ifndef AURA_TYPES_H
#define AURA_TYPES_H

#include <stdbool.h>
#include <stdint.h>

typedef enum {
    AURA_ZONE_LEFT = 0,
    AURA_ZONE_CENTER = 1,
    AURA_ZONE_RIGHT = 2,
    AURA_ZONE_COUNT = 3
} aura_zone_t;

typedef enum {
    AURA_PATTERN_NONE = 0,
    AURA_PATTERN_CONTINUOUS,
    AURA_PATTERN_PULSE_1HZ,
    AURA_PATTERN_PULSE_2HZ,
    AURA_PATTERN_PULSE_4HZ,
    AURA_PATTERN_PULSE_8HZ,
    AURA_PATTERN_OVERRIDE_HEARTBEAT,
    AURA_PATTERN_SYSTEM_PULSE
} aura_pattern_t;

typedef struct {
    uint8_t intensity;
    aura_pattern_t pattern;
} aura_haptic_profile_t;

typedef struct {
    uint16_t left_cm;
    uint16_t center_cm;
    uint16_t right_cm;
    uint32_t timestamp_ms;
} aura_sensor_reading_t;

typedef struct {
    uint8_t motor_id;
    uint8_t intensity;
    uint8_t pattern;
} aura_haptic_override_cmd_t;

typedef struct {
    aura_haptic_profile_t active_profile;
    aura_haptic_profile_t override_profile;
    uint8_t current_duty;
    bool override_active;
    uint32_t override_expires_at_ms;
} aura_motor_state_t;

typedef struct {
    aura_sensor_reading_t sensors;
    aura_motor_state_t motors[AURA_ZONE_COUNT];
    bool ble_connected;
    bool sensor_notify_enabled;
    uint8_t last_sensor_payload[3];
    uint8_t last_status_payload[1];
    uint8_t status_code;
    uint8_t sensor_fault_mask;
    uint16_t battery_mv;
    uint8_t battery_percent;
    uint32_t uptime_ms;
} aura_system_state_t;

#endif