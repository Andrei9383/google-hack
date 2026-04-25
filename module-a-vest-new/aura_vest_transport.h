#ifndef __AURA_VEST_TRANSPORT_H
#define __AURA_VEST_TRANSPORT_H

#include <stdbool.h>
#include <stdint.h>

struct aura_transport_config_s
{
  const char *bind_address;
  uint16_t port;
  const char *state_path;
  const char *haptic_path;
  const char *health_path;
  const char *device_name;
};

int aura_platform_transport_init(const struct aura_transport_config_s *config);
bool aura_platform_transport_read_override(uint8_t payload[3]);
int aura_platform_transport_publish_sensor(const uint8_t payload[3]);
int aura_platform_transport_publish_status(uint8_t status);

#endif /* __AURA_VEST_TRANSPORT_H */