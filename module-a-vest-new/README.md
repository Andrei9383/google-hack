# Module A - Aura Vest Embedded App

This is the NuttX app for the ESP32-Sparrow vest board. It polls three
ultrasonic sensors and drives four vibration motors from one L293D.

## What Changed For Your L293D

The L293D is a four-channel driver. If motor direction does not matter, one chip
can drive four vibration motors:

- Tie `1,2EN` and `3,4EN` high.
- Send PWM from the ESP32 into `1A`, `2A`, `3A`, and `4A`.
- Connect `1Y`, `2Y`, `3Y`, and `4Y` to the four motor positive wires.
- Connect the four motor negative wires to ground.

This uses each L293D channel as a one-way motor output instead of using two
channels per motor as a reversible H-bridge.

## Firmware Behavior

- Sensors: left, center, right.
- Motors: left, center-left, center-right, right.
- The center sensor controls both center motors.
- Android motor override IDs stay compatible with `module-b-android`:
  - `0x01` controls left motor.
  - `0x02` controls both center motors.
  - `0x03` controls right motor.
  - `0x04` is accepted by firmware for center-right-only bench testing.
- Sensor BLE payload remains `[L_cm, C_cm, R_cm]`.

## Default ESP32-Sparrow Pins

These defaults use pins exposed on the Sparrow expansion headers. Some of them
also connect to onboard features, so avoid using the SD card and I2S microphone
while this vest wiring is attached.

### Ultrasonic Sensors

| Sensor | Trig | Echo | Notes |
|---|---:|---:|---|
| Left | GPIO4 | GPIO35 | GPIO35 is input-only, perfect for Echo. |
| Center | GPIO12 | GPIO18 | GPIO12 is a boot strap pin; keep external wiring high-impedance at boot. |
| Right | GPIO32 | GPIO19 | GPIO18/19 are also SD-card related on Sparrow. |

In the patched Sparrow NuttX board support these appear as:

| Firmware path | Real ESP32 pin |
|---|---:|
| `/dev/gpio0` | GPIO4 trigger left |
| `/dev/gpio1` | GPIO12 trigger center |
| `/dev/gpio2` | GPIO32 trigger right |
| `/dev/gpio3` | GPIO35 echo left |
| `/dev/gpio4` | GPIO18 echo center |
| `/dev/gpio5` | GPIO19 echo right |

### Motors

Map the NuttX PWM devices to these GPIOs in your board config:

| Motor | NuttX PWM device | ESP32 GPIO | L293D pin |
|---|---|---:|---|
| Left | `/dev/pwm0` | GPIO25 | `1A` |
| Center-left | `/dev/pwm1` | GPIO26 | `2A` |
| Center-right | `/dev/pwm2` | GPIO27 | `3A` |
| Right | `/dev/pwm3` | GPIO33 | `4A` |

In the patched Sparrow NuttX setup each motor is one LEDC timer with one PWM
channel. That keeps the app simple: `/dev/pwm0` controls only the left motor,
`/dev/pwm1` only center-left, `/dev/pwm2` only center-right, and `/dev/pwm3`
only right.

## Simple Wiring

### 1. Power

You said you are using a 4-slot pack for 1.5 V batteries. With alkaline cells,
that is about 6 V when full.

Do this:

1. Battery pack `+` goes to a switch.
2. Switch output goes to a 5 V buck converter.
3. Buck 5 V output powers the Sparrow through USB 5 V or the board's 5 V/VIN
   header if your exact board revision exposes it.
4. Buck 5 V output also powers HC-SR04 `Vcc`.
5. L293D pin 16 `Vcc1` goes to 5 V.
6. L293D pin 8 `Vcc2` goes to the motor supply.
7. All grounds connect together.

For `Vcc2`, use the voltage your motors actually want. If they are 3 V vibration
motors, the best setup is a second adjustable buck converter set near 3 V. If
you connect them to the raw 4xAA pack, start with low PWM because fresh alkaline
cells can overdrive tiny motors.

Do not connect the 6 V battery pack directly to the Sparrow `3V3` pin.

If the motors feel too strong or get warm, lower:

```text
CONFIG_EXAMPLES_AURA_VEST_MAX_MOTOR_DUTY=128
```

### 2. L293D

For a DIP-16 L293D:

| L293D pin | Connect to |
|---:|---|
| 1 `1,2EN` | 5 V |
| 2 `1A` | ESP32 GPIO25 PWM |
| 3 `1Y` | Left motor `+` |
| 4, 5 | GND |
| 6 `2Y` | Center-left motor `+` |
| 7 `2A` | ESP32 GPIO26 PWM |
| 8 `Vcc2` | Motor supply |
| 9 `3,4EN` | 5 V |
| 10 `3A` | ESP32 GPIO27 PWM |
| 11 `3Y` | Center-right motor `+` |
| 12, 13 | GND |
| 14 `4Y` | Right motor `+` |
| 15 `4A` | ESP32 GPIO33 PWM |
| 16 `Vcc1` | 5 V |

Connect every motor `-` wire to ground.

Put a 470 uF capacitor across L293D `Vcc2` and GND near the chip. Also put a
100 nF capacitor near L293D pin 16 and another near pin 8.

### 3. HC-SR04 Sensors

Each sensor has four pins: `Vcc`, `Trig`, `Echo`, `GND`.

For each sensor:

1. `Vcc` to 5 V.
2. `GND` to common ground.
3. `Trig` to the GPIO in the table above.
4. `Echo` must go through a voltage divider before the ESP32 pin.

Echo voltage divider:

- HC-SR04 Echo to 2 kOhm resistor.
- Other side of 2 kOhm resistor to ESP32 Echo pin.
- ESP32 Echo pin to 3.3 kOhm resistor.
- Other side of 3.3 kOhm resistor to GND.

The divider is important because HC-SR04 Echo is 5 V and ESP32 pins are 3.3 V.

## BLE Contract

The UUIDs match `module-b-android/src/ble/constants.ts`.

| Item | UUID | Direction | Payload |
|---|---|---|---|
| Service | `2E6A0000-C4B2-4D6E-A591-7F8B2D3E1A00` | Advertise | Device name `AURA Vest` |
| Sensor characteristic | `2E6A0001-C4B2-4D6E-A591-7F8B2D3E1A00` | Vest notify/read | `[L_cm, C_cm, R_cm]` |
| Haptic override characteristic | `2E6A0002-C4B2-4D6E-A591-7F8B2D3E1A00` | Android write | `[MotorID, Intensity, Pattern]` |
| Status characteristic | `2E6A0003-C4B2-4D6E-A591-7F8B2D3E1A00` | Vest notify/read | `[status]` |

The C file has weak BLE hooks:

- `aura_platform_ble_init`
- `aura_platform_ble_read_override`
- `aura_platform_ble_notify_sensor`
- `aura_platform_ble_notify_status`

Add the board-specific NimBLE/Bluetooth implementation for those four functions
when your NuttX BLE stack is ready. The haptic/sensor logic already matches the
Android payloads.

## Build In NuttX

1. Copy the app into the NuttX apps tree:

   ```sh
   cp -r module-a-vest-new path/to/nuttx-apps/examples/aura_vest
   ```

2. Register it in `apps/examples/Make.defs`:

   ```make
   ifneq ($(CONFIG_EXAMPLES_AURA_VEST),)
   CONFIGURED_APPS += examples/aura_vest
   endif
   ```

3. Configure your board:

   ```sh
   ./tools/configure.sh esp32-sparrow-kit:nsh
   make menuconfig
   ```

4. Enable the app and device drivers:

   ```text
   CONFIG_EXAMPLES_AURA_VEST=y
   CONFIG_PWM=y
   CONFIG_PWM_MULTICHAN=y
   CONFIG_PWM_NCHANNELS=1
   CONFIG_TIMER=y
   CONFIG_DEV_GPIO=y
   CONFIG_WIRELESS_BLUETOOTH=y
   CONFIG_ESP32_LEDC_TIM0=y
   CONFIG_ESP32_LEDC_TIM0_CHANNELS=1
   CONFIG_ESP32_LEDC_TIM1=y
   CONFIG_ESP32_LEDC_TIM1_CHANNELS=1
   CONFIG_ESP32_LEDC_TIM2=y
   CONFIG_ESP32_LEDC_TIM2_CHANNELS=1
   CONFIG_ESP32_LEDC_TIM3=y
   CONFIG_ESP32_LEDC_TIM3_CHANNELS=1
   CONFIG_ESP32_LEDC_CHANNEL0_PIN=25
   CONFIG_ESP32_LEDC_CHANNEL1_PIN=26
   CONFIG_ESP32_LEDC_CHANNEL2_PIN=27
   CONFIG_ESP32_LEDC_CHANNEL3_PIN=33
   CONFIG_EXAMPLES_AURA_VEST_MAX_MOTOR_DUTY=255
   ```

5. Configure `/dev/gpio*` and `/dev/pwm*` devices for the pins in this README.
   The file `nuttx_aura_vest_esp32s3.config` is a starter fragment. Disable
   SD-card/SPI2 and I2S if you use the exact pin map above, because GPIO18,
   GPIO19, GPIO25, GPIO26, and GPIO27 overlap those peripherals on Sparrow.

6. Build and flash:

   ```sh
   make -j
   ```

## Autostart

I added `init.d/rcS`:

```sh
aura_vest &
```

In NuttX, this is the normal way to start the app automatically after boot. Copy
`module-a-vest-new/init.d/rcS` into the board's ROMFS init directory, or add the
same `aura_vest &` line to the board `etc/init.d/rcS`, and enable:

```text
CONFIG_FS_ROMFS=y
CONFIG_ETC_ROMFS=y
CONFIG_ETC_ROMFSMOUNTPT="/etc"
CONFIG_ETC_ROMFSDEVNO=0
CONFIG_ETC_ROMFSSECTSIZE=64
```

After that, the board starts `aura_vest` by itself. You do not need to type the
command in NSH.

## Distance To Haptic Mapping

| Distance | PWM intensity | Pattern |
|---|---:|---|
| `> 200 cm` | 0% | Off |
| `150-200 cm` | 15% | 1 Hz pulse |
| `100-150 cm` | 35% | 2 Hz pulse |
| `50-100 cm` | 65% | 4 Hz pulse |
| `20-50 cm` | 90% | 8 Hz pulse |
| `< 20 cm` | 100% | Continuous |

Nonzero motor commands are remapped above a minimum duty cycle so small vibration
motors actually start spinning.

## Suggestions To Improve Next

- Add real battery voltage measurement with an ADC divider and send low-battery
  status over BLE.
- Add a startup self-test: briefly pulse each motor one by one and print which
  sensor/motor failed.
- Add median filtering for ultrasonic readings so one bad echo does not cause a
  random buzz.
- Add a hard maximum PWM setting for 3 V motors if you power `Vcc2` above 3 V.
- Replace L293D with a modern MOSFET driver such as DRV8833 later. It wastes
  less voltage, so small motors feel stronger from batteries.
