#define _POSIX_C_SOURCE 200809L

#ifndef AURA_HOST_SIM
#  include <nuttx/config.h>
#endif

#include <errno.h>
#include <fcntl.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/ioctl.h>
#include <time.h>
#include <unistd.h>

#include "aura_vest_transport.h"

#ifndef FAR
#  define FAR
#endif

#ifndef AURA_HOST_SIM
#  include <fixedmath.h>
#  include <nuttx/ioexpander/gpio.h>
#  include <nuttx/timers/pwm.h>
#endif

#define AURA_SENSOR_COUNT 3
#define AURA_MOTOR_COUNT 4
#define AURA_POLL_CYCLE_US 100000
#define AURA_SENSOR_SPACING_US 33000
#define AURA_TRIGGER_PULSE_US 10
#define AURA_ECHO_TIMEOUT_US 38000
#define AURA_OVERRIDE_MS 2000
#define AURA_PWM_FREQUENCY_HZ 200
#define AURA_MIN_EFFECTIVE_DUTY 70

#define AURA_DISTANCE_MAX_CM 400
#define AURA_DISTANCE_CLEAR_CM 200
#define AURA_DISTANCE_APPROACHING_CM 150
#define AURA_DISTANCE_NEAR_CM 100
#define AURA_DISTANCE_VERY_NEAR_CM 50
#define AURA_DISTANCE_DANGER_CM 20

#define AURA_PATTERN_NONE 0
#define AURA_PATTERN_STATIC 1
#define AURA_PATTERN_PULSE_1HZ 2
#define AURA_PATTERN_PULSE_2HZ 3
#define AURA_PATTERN_PULSE_4HZ 4
#define AURA_PATTERN_PULSE_8HZ 5
#define AURA_PATTERN_HEARTBEAT 6
#define AURA_PATTERN_CONTINUOUS 7

#define AURA_OVERRIDE_STATIC 0x00
#define AURA_OVERRIDE_DYNAMIC 0x01
#define AURA_OVERRIDE_DANGER 0x02

#define AURA_STATUS_OK 0x00
#define AURA_STATUS_LOW_BATTERY 0x01
#define AURA_STATUS_CRITICAL_BATTERY 0x02
#define AURA_STATUS_SENSOR_FAULT 0x03

#ifndef CONFIG_EXAMPLES_AURA_VEST_TRIG_LEFT_DEV
#  define CONFIG_EXAMPLES_AURA_VEST_TRIG_LEFT_DEV "/dev/gpio0"
#endif
#ifndef CONFIG_EXAMPLES_AURA_VEST_ECHO_LEFT_DEV
#  define CONFIG_EXAMPLES_AURA_VEST_ECHO_LEFT_DEV "/dev/gpio3"
#endif
#ifndef CONFIG_EXAMPLES_AURA_VEST_TRIG_CENTER_DEV
#  define CONFIG_EXAMPLES_AURA_VEST_TRIG_CENTER_DEV "/dev/gpio1"
#endif
#ifndef CONFIG_EXAMPLES_AURA_VEST_ECHO_CENTER_DEV
#  define CONFIG_EXAMPLES_AURA_VEST_ECHO_CENTER_DEV "/dev/gpio4"
#endif
#ifndef CONFIG_EXAMPLES_AURA_VEST_TRIG_RIGHT_DEV
#  define CONFIG_EXAMPLES_AURA_VEST_TRIG_RIGHT_DEV "/dev/gpio2"
#endif
#ifndef CONFIG_EXAMPLES_AURA_VEST_ECHO_RIGHT_DEV
#  define CONFIG_EXAMPLES_AURA_VEST_ECHO_RIGHT_DEV "/dev/gpio5"
#endif
#ifndef CONFIG_EXAMPLES_AURA_VEST_MOTOR_LEFT_DEV
#  define CONFIG_EXAMPLES_AURA_VEST_MOTOR_LEFT_DEV "/dev/pwm0"
#endif
#ifndef CONFIG_EXAMPLES_AURA_VEST_MOTOR_CENTER_LEFT_DEV
#  define CONFIG_EXAMPLES_AURA_VEST_MOTOR_CENTER_LEFT_DEV "/dev/pwm1"
#endif
#ifndef CONFIG_EXAMPLES_AURA_VEST_MOTOR_CENTER_RIGHT_DEV
#  define CONFIG_EXAMPLES_AURA_VEST_MOTOR_CENTER_RIGHT_DEV "/dev/pwm2"
#endif
#ifndef CONFIG_EXAMPLES_AURA_VEST_MOTOR_RIGHT_DEV
#  define CONFIG_EXAMPLES_AURA_VEST_MOTOR_RIGHT_DEV "/dev/pwm3"
#endif
#ifndef CONFIG_EXAMPLES_AURA_VEST_MAX_MOTOR_DUTY
#  define CONFIG_EXAMPLES_AURA_VEST_MAX_MOTOR_DUTY 255
#endif
#ifndef CONFIG_EXAMPLES_AURA_VEST_HTTP_BIND_ADDRESS
#  define CONFIG_EXAMPLES_AURA_VEST_HTTP_BIND_ADDRESS "0.0.0.0"
#endif
#ifndef CONFIG_EXAMPLES_AURA_VEST_HTTP_PORT
#  define CONFIG_EXAMPLES_AURA_VEST_HTTP_PORT 8080
#endif
#ifndef CONFIG_EXAMPLES_AURA_VEST_HTTP_STATE_PATH
#  define CONFIG_EXAMPLES_AURA_VEST_HTTP_STATE_PATH "/api/v1/state"
#endif
#ifndef CONFIG_EXAMPLES_AURA_VEST_HTTP_HAPTIC_PATH
#  define CONFIG_EXAMPLES_AURA_VEST_HTTP_HAPTIC_PATH "/api/v1/haptic"
#endif
#ifndef CONFIG_EXAMPLES_AURA_VEST_HTTP_HEALTH_PATH
#  define CONFIG_EXAMPLES_AURA_VEST_HTTP_HEALTH_PATH "/api/v1/healthz"
#endif

enum aura_zone_e
{
  AURA_LEFT = 0,
  AURA_CENTER = 1,
  AURA_RIGHT = 2
};

enum aura_motor_e
{
  AURA_MOTOR_LEFT = 0,
  AURA_MOTOR_CENTER_LEFT = 1,
  AURA_MOTOR_CENTER_RIGHT = 2,
  AURA_MOTOR_RIGHT = 3
};

struct aura_zone_config_s
{
  const char *name;
  const char *trig_dev;
  const char *echo_dev;
};

struct aura_motor_config_s
{
  const char *name;
  const char *pwm_dev;
};

struct aura_zone_hw_s
{
  int trig_fd;
  int echo_fd;
};

struct aura_motor_hw_s
{
  int pwm_fd;
};

struct aura_haptic_command_s
{
  uint8_t intensity;
  uint8_t pattern;
};

struct aura_override_s
{
  bool active;
  uint64_t expires_ms;
  struct aura_haptic_command_s command;
};

struct aura_app_s
{
  struct aura_zone_hw_s sensors[AURA_SENSOR_COUNT];
  struct aura_motor_hw_s motors[AURA_MOTOR_COUNT];
  uint16_t distance_cm[AURA_SENSOR_COUNT];
  struct aura_override_s overrides[AURA_MOTOR_COUNT];
  uint64_t boot_ms;
  uint64_t last_log_ms;
  uint8_t status;
};

static const struct aura_zone_config_s g_zone_config[AURA_SENSOR_COUNT] =
{
  {
    "left",
    CONFIG_EXAMPLES_AURA_VEST_TRIG_LEFT_DEV,
    CONFIG_EXAMPLES_AURA_VEST_ECHO_LEFT_DEV
  },
  {
    "center",
    CONFIG_EXAMPLES_AURA_VEST_TRIG_CENTER_DEV,
    CONFIG_EXAMPLES_AURA_VEST_ECHO_CENTER_DEV
  },
  {
    "right",
    CONFIG_EXAMPLES_AURA_VEST_TRIG_RIGHT_DEV,
    CONFIG_EXAMPLES_AURA_VEST_ECHO_RIGHT_DEV
  }
};

static const struct aura_motor_config_s g_motor_config[AURA_MOTOR_COUNT] =
{
  {
    "left",
    CONFIG_EXAMPLES_AURA_VEST_MOTOR_LEFT_DEV
  },
  {
    "center-left",
    CONFIG_EXAMPLES_AURA_VEST_MOTOR_CENTER_LEFT_DEV
  },
  {
    "center-right",
    CONFIG_EXAMPLES_AURA_VEST_MOTOR_CENTER_RIGHT_DEV
  },
  {
    "right",
    CONFIG_EXAMPLES_AURA_VEST_MOTOR_RIGHT_DEV
  }
};

static uint64_t aura_time_us(void)
{
  struct timespec ts;

  clock_gettime(CLOCK_MONOTONIC, &ts);
  return ((uint64_t)ts.tv_sec * 1000000ULL) + ((uint64_t)ts.tv_nsec / 1000ULL);
}

static uint64_t aura_time_ms(void)
{
  return aura_time_us() / 1000ULL;
}

static void aura_sleep_us(uint64_t delay_us)
{
  struct timespec ts;

  ts.tv_sec = (time_t)(delay_us / 1000000ULL);
  ts.tv_nsec = (long)((delay_us % 1000000ULL) * 1000ULL);
  nanosleep(&ts, NULL);
}

static bool aura_has_dev(const char *path)
{
  return path != NULL && path[0] != '\0';
}

static int aura_open_optional(const char *path, int flags)
{
  int fd;

  if (!aura_has_dev(path))
    {
      return -1;
    }

  fd = open(path, flags);
  if (fd < 0)
    {
      printf("aura_vest: failed to open %s: %d\n", path, errno);
    }

  return fd;
}

static int aura_gpio_write(int fd, bool value)
{
  if (fd < 0)
    {
      return -ENODEV;
    }

#ifdef AURA_HOST_SIM
  (void)value;
  return 0;
#else
  return ioctl(fd, GPIOC_WRITE, (unsigned long)value);
#endif
}

static int aura_gpio_read(int fd, bool *value)
{
  if (fd < 0 || value == NULL)
    {
      return -EINVAL;
    }

#ifdef AURA_HOST_SIM
  *value = false;
  return 0;
#else
  return ioctl(fd, GPIOC_READ, (unsigned long)((uintptr_t)value));
#endif
}

static uint8_t aura_scale_motor_duty(uint8_t duty)
{
  uint16_t limited = duty;
  uint16_t max_duty = CONFIG_EXAMPLES_AURA_VEST_MAX_MOTOR_DUTY;

  if (duty == 0)
    {
      return 0;
    }

  if (max_duty > 255U)
    {
      max_duty = 255U;
    }

  if (limited > max_duty)
    {
      limited = max_duty;
    }

  if (limited < AURA_MIN_EFFECTIVE_DUTY &&
      max_duty >= AURA_MIN_EFFECTIVE_DUTY)
    {
      limited = AURA_MIN_EFFECTIVE_DUTY;
    }

  return (uint8_t)limited;
}

static int aura_pwm_write(int fd, uint8_t duty)
{
  const uint8_t effective = aura_scale_motor_duty(duty);
#ifndef AURA_HOST_SIM
  struct pwm_info_s info;
  const ub16_t duty_b16 =
    (ub16_t)(((uint32_t)effective * 65535U) / 255U);
#endif

  if (fd < 0)
    {
      return -ENODEV;
    }

#ifdef AURA_HOST_SIM
  printf("aura_vest: pwm fd=%d duty=%u effective=%u\n", fd, duty, effective);
  return 0;
#else
  memset(&info, 0, sizeof(info));
  info.frequency = AURA_PWM_FREQUENCY_HZ;
#ifdef CONFIG_PWM_MULTICHAN
  info.channels[0].duty = duty_b16;
  info.channels[0].cpol = PWM_CPOL_LOW;
  info.channels[0].channel = 1;
#else
  info.duty = duty_b16;
  info.cpol = PWM_CPOL_LOW;
#endif

  if (ioctl(fd, PWMIOC_SETCHARACTERISTICS, (unsigned long)((uintptr_t)&info)) < 0)
    {
      return -errno;
    }

  return ioctl(fd, PWMIOC_START, 0);
#endif
}

static uint8_t aura_pulse(uint8_t intensity, uint32_t elapsed_ms,
                          uint32_t period_ms, uint32_t on_ms)
{
  const uint32_t phase = elapsed_ms % period_ms;
  return phase < on_ms ? intensity : 0;
}

static uint8_t aura_pattern_sample(uint8_t pattern, uint8_t intensity,
                                   uint32_t elapsed_ms)
{
  switch (pattern)
    {
      case AURA_PATTERN_NONE:
        return 0;

      case AURA_PATTERN_STATIC:
      case AURA_PATTERN_CONTINUOUS:
        return intensity;

      case AURA_PATTERN_PULSE_1HZ:
        return aura_pulse(intensity, elapsed_ms, 1000, 500);

      case AURA_PATTERN_PULSE_2HZ:
        return aura_pulse(intensity, elapsed_ms, 500, 250);

      case AURA_PATTERN_PULSE_4HZ:
        return aura_pulse(intensity, elapsed_ms, 250, 125);

      case AURA_PATTERN_PULSE_8HZ:
        return aura_pulse(intensity, elapsed_ms, 125, 62);

      case AURA_PATTERN_HEARTBEAT:
        {
          const uint32_t phase = elapsed_ms % 1000;
          return (phase < 200 || (phase >= 300 && phase < 500)) ? intensity : 0;
        }

      default:
        return 0;
    }
}

static struct aura_haptic_command_s aura_distance_to_haptic(uint16_t distance_cm)
{
  struct aura_haptic_command_s command;

  if (distance_cm > AURA_DISTANCE_CLEAR_CM)
    {
      command.intensity = 0;
      command.pattern = AURA_PATTERN_NONE;
    }
  else if (distance_cm > AURA_DISTANCE_APPROACHING_CM)
    {
      command.intensity = 70; /* ~27% of 255 */
      command.pattern = AURA_PATTERN_PULSE_1HZ;
    }
  else if (distance_cm > AURA_DISTANCE_NEAR_CM)
    {
      command.intensity = 89; /* ~35% */
      command.pattern = AURA_PATTERN_PULSE_2HZ;
    }
  else if (distance_cm > AURA_DISTANCE_VERY_NEAR_CM)
    {
      command.intensity = 112; /* ~44% */
      command.pattern = AURA_PATTERN_PULSE_4HZ;
    }
  else if (distance_cm >= AURA_DISTANCE_DANGER_CM)
    {
      command.intensity = 115; /* ~45% */
      command.pattern = AURA_PATTERN_PULSE_8HZ;
    }
  else
    {
      command.intensity = 128; /* ~50% hard limit for 6 V motor rail */
      command.pattern = AURA_PATTERN_CONTINUOUS;
    }

  return command;
}

static uint16_t aura_read_hcsr04_cm(struct aura_zone_hw_s *hw)
{
  bool level;
  uint64_t deadline;
  uint64_t pulse_start;
  uint64_t pulse_end;
  uint64_t pulse_width;
  int ret;

  if (hw->trig_fd < 0 || hw->echo_fd < 0)
    {
      return AURA_DISTANCE_MAX_CM;
    }

  aura_gpio_write(hw->trig_fd, false);
  aura_sleep_us(2);
  aura_gpio_write(hw->trig_fd, true);
  aura_sleep_us(AURA_TRIGGER_PULSE_US);
  aura_gpio_write(hw->trig_fd, false);

  deadline = aura_time_us() + AURA_ECHO_TIMEOUT_US;
  do
    {
      ret = aura_gpio_read(hw->echo_fd, &level);
      if (ret < 0)
        {
          return AURA_DISTANCE_MAX_CM;
        }
      if (level)
        {
          break;
        }
    }
  while (aura_time_us() < deadline);

  if (!level)
    {
      return AURA_DISTANCE_MAX_CM;
    }

  pulse_start = aura_time_us();
  deadline = pulse_start + AURA_ECHO_TIMEOUT_US;

  do
    {
      ret = aura_gpio_read(hw->echo_fd, &level);
      if (ret < 0)
        {
          return AURA_DISTANCE_MAX_CM;
        }
      if (!level)
        {
          break;
        }
    }
  while (aura_time_us() < deadline);

  pulse_end = aura_time_us();
  pulse_width = pulse_end > pulse_start ? pulse_end - pulse_start : 0;

  if (pulse_width == 0 || pulse_width > AURA_ECHO_TIMEOUT_US)
    {
      return AURA_DISTANCE_MAX_CM;
    }

  pulse_width = pulse_width / 58ULL;
  if (pulse_width < 2ULL)
    {
      return 2;
    }
  if (pulse_width > AURA_DISTANCE_MAX_CM)
    {
      return AURA_DISTANCE_MAX_CM;
    }

  return (uint16_t)pulse_width;
}

static void aura_encode_sensor_payload(const uint16_t distance_cm[AURA_SENSOR_COUNT],
                                       uint8_t payload[3])
{
  int i;

  for (i = 0; i < AURA_SENSOR_COUNT; i++)
    {
      payload[i] = distance_cm[i] > 255 ? 0xff : (uint8_t)distance_cm[i];
    }
}

static bool aura_decode_override(const uint8_t payload[3], uint8_t *motor_mask,
                                 struct aura_haptic_command_s *command)
{
  if (payload == NULL || motor_mask == NULL || command == NULL)
    {
      return false;
    }

  if (payload[0] < 1 || payload[0] > AURA_MOTOR_COUNT)
    {
      return false;
    }

  switch (payload[0])
    {
      case 0x01:
        *motor_mask = 1U << AURA_MOTOR_LEFT;
        break;

      case 0x02:
        *motor_mask = (1U << AURA_MOTOR_CENTER_LEFT) |
                      (1U << AURA_MOTOR_CENTER_RIGHT);
        break;

      case 0x03:
        *motor_mask = 1U << AURA_MOTOR_RIGHT;
        break;

      case 0x04:
        *motor_mask = 1U << AURA_MOTOR_CENTER_RIGHT;
        break;

      default:
        return false;
    }

  command->intensity = payload[1];

  switch (payload[2])
    {
      case AURA_OVERRIDE_STATIC:
        command->pattern = AURA_PATTERN_STATIC;
        break;

      case AURA_OVERRIDE_DYNAMIC:
        command->pattern = AURA_PATTERN_HEARTBEAT;
        break;

      case AURA_OVERRIDE_DANGER:
        command->pattern = AURA_PATTERN_CONTINUOUS;
        break;

      default:
        return false;
    }

  return true;
}

static void aura_apply_override(struct aura_app_s *app, const uint8_t payload[3])
{
  uint8_t motor;
  uint8_t motor_mask;
  struct aura_haptic_command_s command;

  if (!aura_decode_override(payload, &motor_mask, &command))
    {
      printf("aura_vest: rejected override [%u,%u,%u]\n",
             payload[0], payload[1], payload[2]);
      return;
    }

  for (motor = 0; motor < AURA_MOTOR_COUNT; motor++)
    {
      if ((motor_mask & (1U << motor)) != 0)
        {
          app->overrides[motor].active = true;
          app->overrides[motor].expires_ms = aura_time_ms() + AURA_OVERRIDE_MS;
          app->overrides[motor].command = command;
        }
    }

  printf("aura_vest: override motor_id=%u intensity=%u pattern=%u\n",
         payload[0], command.intensity, command.pattern);
}

static int aura_motor_sensor_index(int motor)
{
  switch (motor)
    {
      case AURA_MOTOR_LEFT:
        return AURA_LEFT;

      case AURA_MOTOR_CENTER_LEFT:
      case AURA_MOTOR_CENTER_RIGHT:
        return AURA_CENTER;

      case AURA_MOTOR_RIGHT:
      default:
        return AURA_RIGHT;
    }
}

static struct aura_haptic_command_s aura_motor_command(struct aura_app_s *app,
                                                       int motor,
                                                       uint64_t now_ms)
{
  if (app->overrides[motor].active)
    {
      if (now_ms < app->overrides[motor].expires_ms)
        {
          return app->overrides[motor].command;
        }

      app->overrides[motor].active = false;
    }

  return aura_distance_to_haptic(app->distance_cm[aura_motor_sensor_index(motor)]);
}

static void aura_update_motors(struct aura_app_s *app, uint64_t now_ms)
{
  int motor;

  for (motor = 0; motor < AURA_MOTOR_COUNT; motor++)
    {
      const struct aura_haptic_command_s command =
        aura_motor_command(app, motor, now_ms);
      const uint8_t duty =
        aura_pattern_sample(command.pattern, command.intensity,
                            (uint32_t)(now_ms - app->boot_ms));

      aura_pwm_write(app->motors[motor].pwm_fd, duty);
    }
}

static void aura_buzz_all(struct aura_app_s *app, uint32_t on_ms)
{
  int motor;

  for (motor = 0; motor < AURA_MOTOR_COUNT; motor++)
    {
      aura_pwm_write(app->motors[motor].pwm_fd, 200);
    }

  aura_sleep_us((uint64_t)on_ms * 1000ULL);

  for (motor = 0; motor < AURA_MOTOR_COUNT; motor++)
    {
      aura_pwm_write(app->motors[motor].pwm_fd, 0);
    }
}

static int aura_init_hardware(struct aura_app_s *app)
{
  int zone;
  int motor;
  int faults = 0;

  for (zone = 0; zone < AURA_SENSOR_COUNT; zone++)
    {
      const struct aura_zone_config_s *cfg = &g_zone_config[zone];
      struct aura_zone_hw_s *sensor = &app->sensors[zone];

      sensor->trig_fd = aura_open_optional(cfg->trig_dev, O_RDWR);
      sensor->echo_fd = aura_open_optional(cfg->echo_dev, O_RDONLY);
      aura_gpio_write(sensor->trig_fd, false);

      if (sensor->trig_fd < 0 || sensor->echo_fd < 0)
        {
          faults++;
        }

      printf("aura_vest: sensor %s trig=%s echo=%s\n",
             cfg->name, cfg->trig_dev, cfg->echo_dev);
    }

  for (motor = 0; motor < AURA_MOTOR_COUNT; motor++)
    {
      const struct aura_motor_config_s *cfg = &g_motor_config[motor];
      struct aura_motor_hw_s *motor_hw = &app->motors[motor];

      motor_hw->pwm_fd = aura_open_optional(cfg->pwm_dev, O_RDWR);
      aura_pwm_write(motor_hw->pwm_fd, 0);

      if (motor_hw->pwm_fd < 0)
        {
          faults++;
        }

      printf("aura_vest: motor %s pwm=%s\n", cfg->name, cfg->pwm_dev);
    }

  return faults == 0 ? 0 : -ENODEV;
}

static void aura_poll_sensors(struct aura_app_s *app)
{
  int zone;

  for (zone = 0; zone < AURA_SENSOR_COUNT; zone++)
    {
      const uint64_t target_us = aura_time_us() + AURA_SENSOR_SPACING_US;

      app->distance_cm[zone] = aura_read_hcsr04_cm(&app->sensors[zone]);

      if (zone + 1 < AURA_SENSOR_COUNT)
        {
          const uint64_t now_us = aura_time_us();
          if (target_us > now_us)
            {
              aura_sleep_us(target_us - now_us);
            }
        }
    }
}

int main(int argc, FAR char *argv[])
{
  struct aura_app_s app;
  struct aura_transport_config_s transport_config;
  uint8_t sensor_payload[3];
  uint8_t override_payload[3];

  (void)argc;
  (void)argv;

  memset(&app, 0, sizeof(app));
  app.boot_ms = aura_time_ms();
  app.status = AURA_STATUS_OK;

  transport_config.bind_address = CONFIG_EXAMPLES_AURA_VEST_HTTP_BIND_ADDRESS;
  transport_config.port = CONFIG_EXAMPLES_AURA_VEST_HTTP_PORT;
  transport_config.state_path = CONFIG_EXAMPLES_AURA_VEST_HTTP_STATE_PATH;
  transport_config.haptic_path = CONFIG_EXAMPLES_AURA_VEST_HTTP_HAPTIC_PATH;
  transport_config.health_path = CONFIG_EXAMPLES_AURA_VEST_HTTP_HEALTH_PATH;
  transport_config.device_name = "AURA Sparrow Vest";

  printf("aura_vest: starting Sparrow WiFi vest app\n");

  if (aura_init_hardware(&app) < 0)
    {
      app.status = AURA_STATUS_SENSOR_FAULT;
    }

  aura_platform_transport_init(&transport_config);
  aura_platform_transport_publish_status(app.status);
  aura_buzz_all(&app, 300);

  for (;;)
    {
      const uint64_t cycle_start_us = aura_time_us();
      const uint64_t now_ms = aura_time_ms();
      uint64_t elapsed_us;

      while (aura_platform_transport_read_override(override_payload))
        {
          aura_apply_override(&app, override_payload);
        }

      aura_poll_sensors(&app);
      aura_update_motors(&app, now_ms);

      aura_encode_sensor_payload(app.distance_cm, sensor_payload);
      aura_platform_transport_publish_sensor(sensor_payload);

      if (now_ms - app.last_log_ms >= 1000ULL)
        {
          app.last_log_ms = now_ms;
          printf("aura_vest: L=%ucm C=%ucm R=%ucm payload=[%u,%u,%u]\n",
                 app.distance_cm[AURA_LEFT], app.distance_cm[AURA_CENTER],
                 app.distance_cm[AURA_RIGHT], sensor_payload[0],
                 sensor_payload[1], sensor_payload[2]);
        }

      elapsed_us = aura_time_us() - cycle_start_us;
      if (elapsed_us < AURA_POLL_CYCLE_US)
        {
          aura_sleep_us(AURA_POLL_CYCLE_US - elapsed_us);
        }
    }

  return 0;
}
