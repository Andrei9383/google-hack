#ifndef __AURA_VEST_BLE_H
#define __AURA_VEST_BLE_H

#include <stdbool.h>
#include <stdint.h>

struct aura_ble_config_s
{
  const char *service_uuid;
  const char *sensor_uuid;
  const char *haptic_uuid;
  const char *status_uuid;
  const char *device_name;
};

int aura_platform_ble_init(const struct aura_ble_config_s *config);
bool aura_platform_ble_read_override(uint8_t payload[3]);
int aura_platform_ble_notify_sensor(const uint8_t payload[3]);
int aura_platform_ble_notify_status(uint8_t status);

#endif /* __AURA_VEST_BLE_H */
