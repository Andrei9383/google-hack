# Module A - Aura Sparrow Vest Firmware

This is the NuttX app for the ESP32 Sparrow / Sparrow V2 vest board.

The vest now talks to the Android app over WiFi HTTP. The watch path stays on BLE and does not need firmware changes in this module.

## What The Firmware Does

- Reads three HC-SR04 ultrasonic sensors: left, center, right.
- Drives four vibration motors through one L293D.
- Publishes live sensor and status data over HTTP.
- Accepts haptic override commands from the Android app over HTTP.

Motor IDs stay compatible with the Android fusion logic:

- `0x01`: left motor
- `0x02`: both center motors
- `0x03`: right motor
- `0x04`: center-right only, useful for bench testing

## WiFi API Contract

The firmware serves three endpoints by default on port `8080`.

### `GET /api/v1/state`

Example response:

```json
{
  "device": "AURA Sparrow Vest",
  "transport": "wifi",
  "sensorPayload": [12, 55, 99],
  "sensor": {
    "left": 12,
    "center": 55,
    "right": 99
  },
  "status": 0
}
```

### `GET /api/v1/healthz`

Example response:

```json
{
  "ok": true,
  "status": 0
}
```

### `POST /api/v1/haptic`

Request body:

```json
{
  "motorId": 1,
  "intensity": 176,
  "pattern": 1
}
```

Response: `202 Accepted`

## Default Sparrow Pin Map

These defaults use pins that are accessible on the Sparrow headers. Some overlap onboard peripherals, so do not use the SD card or I2S microphone at the same time as this vest wiring.

### Ultrasonic Sensors

| Sensor | Trig | Echo | Notes |
|---|---:|---:|---|
| Left | GPIO4 | GPIO35 | GPIO35 is input-only, ideal for Echo. |
| Center | GPIO12 | GPIO18 | GPIO12 is a boot strap pin, so keep it high-impedance at boot. |
| Right | GPIO32 | GPIO19 | GPIO18 and GPIO19 overlap SD-card wiring on Sparrow. |

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

Configure the PWM devices like this:

| Motor | NuttX PWM device | ESP32 GPIO | L293D pin |
|---|---|---:|---|
| Left | `/dev/pwm0` | GPIO25 | `1A` |
| Center-left | `/dev/pwm1` | GPIO26 | `2A` |
| Center-right | `/dev/pwm2` | GPIO27 | `3A` |
| Right | `/dev/pwm3` | GPIO33 | `4A` |

## Wiring Summary

### Power

For a 4xAA pack:

1. Battery pack `+` goes through a switch.
2. The switched line feeds a 5 V buck converter.
3. The buck output powers the Sparrow and the HC-SR04 sensors.
4. L293D pin `16` (`Vcc1`) goes to 5 V.
5. L293D pin `8` (`Vcc2`) goes to the actual motor supply.
6. All grounds must be common.

If your vibration motors are rated closer to 3 V, use a second buck converter for the motor rail or reduce the maximum duty cycle.

### L293D

| L293D pin | Connect to |
|---:|---|
| 1 `1,2EN` | 5 V |
| 2 `1A` | GPIO25 PWM |
| 3 `1Y` | Left motor `+` |
| 4, 5 | GND |
| 6 `2Y` | Center-left motor `+` |
| 7 `2A` | GPIO26 PWM |
| 8 `Vcc2` | Motor supply |
| 9 `3,4EN` | 5 V |
| 10 `3A` | GPIO27 PWM |
| 11 `3Y` | Center-right motor `+` |
| 12, 13 | GND |
| 14 `4Y` | Right motor `+` |
| 15 `4A` | GPIO33 PWM |
| 16 `Vcc1` | 5 V |

Connect every motor negative wire to ground.

### HC-SR04

Each sensor must use a voltage divider on `Echo` before the ESP32 input.

- Sensor `Echo` -> 2 kOhm resistor -> ESP32 `Echo` pin
- ESP32 `Echo` pin -> 3.3 kOhm resistor -> GND

This is mandatory because HC-SR04 `Echo` is 5 V and the ESP32 pins are 3.3 V only.

## Build And Flash

Use the 2024 SI lab flow for Sparrow V2 with ESP32. The correct baseline is plain Apache NuttX plus the separate `apps` repository, not a Hacktor Watch fork.

### 1. Install host packages

On newer Ubuntu releases, `libncurses-dev` replaces the older `libncurses5-dev` package names from the lab page.

```sh
sudo apt-get update
sudo apt-get install -y \
  bison flex gettext texinfo gperf automake libtool pkg-config \
  build-essential genromfs libgmp-dev libmpc-dev libmpfr-dev libisl-dev \
  binutils-dev libelf-dev libexpat-dev gcc-multilib g++-multilib \
  picocom u-boot-tools util-linux chrony libusb-dev libusb-1.0-0-dev \
  kconfig-frontends python3-pip python3-venv libncurses-dev
```

### 2. Install the ESP32 Xtensa toolchain

```sh
cd ~
wget https://github.com/espressif/crosstool-NG/releases/download/esp-12.2.0_20230208/xtensa-esp32-elf-12.2.0_20230208-x86_64-linux-gnu.tar.xz
tar -xf xtensa-esp32-elf-12.2.0_20230208-x86_64-linux-gnu.tar.xz
sudo mkdir -p /opt/xtensa
sudo mv xtensa-esp32-elf /opt/xtensa/
echo 'export PATH=$PATH:/opt/xtensa/xtensa-esp32-elf/bin' >> ~/.bashrc
source ~/.bashrc
```

### 3. Clone the NuttX repositories used by the lab

```sh
mkdir -p ~/nuttxspace
cd ~/nuttxspace
git clone --branch=nuttx-12.5.1 https://github.com/apache/incubator-nuttx.git nuttx
git clone --branch=nuttx-12.5.1 https://github.com/apache/incubator-nuttx-apps.git apps
```

### 4. Download the ESP32 bootloader and partition table

```sh
cd ~/nuttxspace
mkdir -p esp-bins
curl -L "https://github.com/espressif/esp-nuttx-bootloader/releases/download/latest/bootloader-esp32.bin" -o esp-bins/bootloader-esp32.bin
curl -L "https://github.com/espressif/esp-nuttx-bootloader/releases/download/latest/partition-table-esp32.bin" -o esp-bins/partition-table-esp32.bin
python3 -m venv ~/nuttxspace/.venv
source ~/nuttxspace/.venv/bin/activate
python -m pip install --upgrade pip
python -m pip install esptool pyserial
```

If `pip3 install ...` fails with `externally-managed-environment`, do not use `--break-system-packages`. Use the virtual environment above instead.

Before running any `make` command, ensure both the Xtensa toolchain and the
virtualenv binaries are on `PATH`:

```sh
export PATH=$PATH:/opt/xtensa/xtensa-esp32-elf/bin:$HOME/nuttxspace/.venv/bin
```

### 5. Copy the Aura vest app into `apps`

```sh
rm -rf ~/nuttxspace/apps/examples/aura_vest
cp -r /home/andrei/google-hackathon-2/module-a-vest-new ~/nuttxspace/apps/examples/aura_vest
```

### 6. Register the app in `apps/Make.defs`

Add this block to `~/nuttxspace/apps/Make.defs` if it is not already present:

```make
ifneq ($(CONFIG_EXAMPLES_AURA_VEST),)
CONFIGURED_APPS += examples/aura_vest
endif
```

### 7. Configure NuttX for Sparrow

If you use the Aura-ready `defconfig` from this repository at
`/home/andrei/google-hackathon-2/defconfig`, you do not need to browse
`make menuconfig` manually.

Use this faster path instead:

1. Copy the repository `defconfig` over the board default.
2. Run `make distclean`.
3. Configure and build directly.

Example:

```sh
cd ~/nuttxspace
cp /home/andrei/google-hackathon-2/defconfig nuttx/boards/xtensa/esp32/esp32-sparrow-kit/configs/nsh/defconfig
cd nuttx
make distclean
./tools/configure.sh -l -a ../apps esp32-sparrow-kit:nsh
make EXTRAFLAGS="-DESP32_IGNORE_CHIP_REVISION_CHECK" -j4
```

The repository `defconfig` already includes the Aura-specific delta on top of
the Sparrow 2024 lab baseline, including:

- `CONFIG_EXAMPLES_AURA_VEST=y`
- `CONFIG_DEV_GPIO=y`
- `CONFIG_NETUTILS_NETLIB=y`
- 4 separate LEDC timers with pins `25`, `26`, `27`, `33`
- the WiFi and WAPI settings from the Sparrow lab baseline

It also disables the onboard RGB LED, I2S microphone, and SD-card/SPI2 paths
because they reuse the same pins and LEDC resources needed by the vest motors
and ultrasonic wiring.

Only use the manual `make menuconfig` path below if you want to edit those
options interactively.

```sh
cd ~/nuttxspace/nuttx
./tools/configure.sh -l -a ../apps esp32-sparrow-kit:nsh
make menuconfig
```

`menuconfig` does not show the raw README block as a flat list of
`CONFIG_...=y` lines. It shows human-readable menu entries.

Use `/` inside `menuconfig` and search for the symbol name without the
`CONFIG_` prefix. Examples:

- `EXAMPLES_AURA_VEST`
- `DEV_GPIO`
- `NET`
- `ESP32_WIFI`
- `WIRELESS_WAPI`
- `ESP32_LEDC_CHANNEL0_PIN`

The main paths are:

- `EXAMPLES_AURA_VEST`: `Application Configuration -> Examples -> Aura Vest embedded app`
- `DEV_GPIO`: `Device Drivers -> GPIO driver`
- `PWM`, `PWM_MULTICHAN`, `TIMER`: `Device Drivers -> Timer Driver Support`
- `NET`: `Networking Support -> Networking support`
- `NET_TCP`: `Networking Support -> TCP/IP Networking`
- `NET_SOCKOPTS`: `Networking Support -> Socket Support`
- `NETDB_DNSCLIENT`: `Library Routines -> NETDB Support -> DNS Name resolution`
- `NETUTILS_NETLIB`: `Application Configuration -> Network Utilities -> Network support library`
- `ESP32_WIFI`: `System Type -> ESP32 Peripheral Selection -> Wi-Fi`
- `WIRELESS_WAPI`: `Application Configuration -> Wireless Libraries and NSH Add-Ons -> WAPI`
- `ESP32_LEDC_TIM0..3` and `ESP32_LEDC_CHANNEL0_PIN..3_PIN`: `System Type -> ESP32 Peripheral Selection -> LEDC Configuration`

If a symbol does not appear, it usually means a parent option is still off.
For example, `NET_TCP`, `NET_SOCKOPTS`, and `NETDB_DNSCLIENT` stay hidden until
`NET` is enabled.

Inside `menuconfig`, make sure at least these are enabled:

```text
CONFIG_EXAMPLES_AURA_VEST=y
CONFIG_DEV_GPIO=y
CONFIG_PWM=y
CONFIG_PWM_MULTICHAN=y
CONFIG_TIMER=y
CONFIG_NET=y
CONFIG_NET_TCP=y
CONFIG_NET_SOCKOPTS=y
CONFIG_NETDB_DNSCLIENT=y
CONFIG_NETUTILS_NETLIB=y
CONFIG_ESP32_WIFI=y
CONFIG_WIRELESS_WAPI=y
CONFIG_ESP32_LEDC_TIM0=y
CONFIG_ESP32_LEDC_TIM1=y
CONFIG_ESP32_LEDC_TIM2=y
CONFIG_ESP32_LEDC_TIM3=y
CONFIG_ESP32_LEDC_CHANNEL0_PIN=25
CONFIG_ESP32_LEDC_CHANNEL1_PIN=26
CONFIG_ESP32_LEDC_CHANNEL2_PIN=27
CONFIG_ESP32_LEDC_CHANNEL3_PIN=33
```

### 8. Build with the mandatory Sparrow workaround

```sh
make EXTRAFLAGS="-DESP32_IGNORE_CHIP_REVISION_CHECK" -j4
```

The 2024 lab is explicit here: this flag must always be present for these boards.

### 9. Flash the board

Find the serial port first:

```sh
ls /dev/ttyUSB* /dev/ttyACM* 2>/dev/null
```

If needed, erase flash first:

```sh
esptool --chip esp32 --port /dev/ttyUSB0 erase-flash
```

Put the board in download mode:

1. Hold `BOOT` (`IO0`)
2. Press `RESET`
3. Release `BOOT` when flashing starts

Then flash:

```sh
make flash ESPTOOL_PORT=/dev/ttyUSB0 ESPTOOL_BAUD=115200 ESPTOOL_BINDIR=../esp-bins
```

If `/dev/ttyUSB0` is not your device, replace it with the correct port.

The equivalent raw `esptool.py` command from the lab is:

```sh
esptool --chip esp32 --port /dev/ttyUSB0 --baud 921600 write-flash \
  0x1000 ../esp-bins/bootloader-esp32.bin \
  0x8000 ../esp-bins/partition-table-esp32.bin \
  0x10000 nuttx.bin
```

### 10. Open the NSH console

```sh
picocom /dev/ttyUSB0 -b 115200
```

Press `Enter` until you get the `nsh>` prompt.

## Bring Up WiFi On The Vest

At the NSH prompt:

```sh
ifup wlan0
wapi psk wlan0 YOUR_SSID YOUR_PASSWORD
renew wlan0
ifconfig wlan0
```

Use the IP shown by `ifconfig wlan0` in the Android app.

If you are not using the autostart script yet, launch the firmware manually:

```sh
aura_vest &
```

## Autostart

This module already includes `init.d/rcS` with:

```sh
aura_vest &
```

Copy that file into the ROMFS init script location used by your Sparrow image if you want the app to start automatically after boot.

## Android Connection Flow

1. Build and open the Android app from `module-b-android`.
2. Keep Bluetooth enabled on the phone for the watch.
3. In the app home screen, enter the vest URL as:

   ```text
   http://<sparrow-ip>:8080
   ```

4. Tap `APPLY VEST URL`.
5. Wait for the `Vest` status to turn connected.

The watch continues to use BLE exactly as before.

## Distance To Haptic Mapping

| Distance | PWM intensity | Pattern |
|---|---:|---|
| `> 200 cm` | 0% | Off |
| `150-200 cm` | 15% | 1 Hz pulse |
| `100-150 cm` | 35% | 2 Hz pulse |
| `50-100 cm` | 65% | 4 Hz pulse |
| `20-50 cm` | 90% | 8 Hz pulse |
| `< 20 cm` | 100% | Continuous |

Nonzero commands are remapped above a minimum duty cycle so small vibration motors actually start spinning.