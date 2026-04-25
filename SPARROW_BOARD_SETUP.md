# Sparrow Board Setup

These instructions are for Sparrow V2 boards with ESP32 and follow the 2024 SI lab flow.

The correct baseline is:

- Apache NuttX repository
- Apache NuttX `apps` repository
- board target `esp32-sparrow-kit:nsh`
- Espressif prebuilt bootloader and partition table binaries

Do not use the earlier Hacktor Watch repository path for this board.

## 1. Install host dependencies

```sh
sudo apt-get update
sudo apt-get install -y \
  bison flex gettext texinfo gperf automake libtool pkg-config \
  build-essential genromfs libgmp-dev libmpc-dev libmpfr-dev libisl-dev \
  binutils-dev libelf-dev libexpat-dev gcc-multilib g++-multilib \
  picocom u-boot-tools util-linux chrony libusb-dev libusb-1.0-0-dev \
  kconfig-frontends python3-pip python3-venv libncurses-dev
```

## 2. Install the Xtensa ESP32 toolchain

```sh
cd ~
wget https://github.com/espressif/crosstool-NG/releases/download/esp-12.2.0_20230208/xtensa-esp32-elf-12.2.0_20230208-x86_64-linux-gnu.tar.xz
tar -xf xtensa-esp32-elf-12.2.0_20230208-x86_64-linux-gnu.tar.xz
sudo mkdir -p /opt/xtensa
sudo mv xtensa-esp32-elf /opt/xtensa/
echo 'export PATH=$PATH:/opt/xtensa/xtensa-esp32-elf/bin' >> ~/.bashrc
source ~/.bashrc
```

## 3. Clone NuttX and apps

```sh
mkdir -p ~/nuttxspace
cd ~/nuttxspace
git clone --branch=nuttx-12.5.1 https://github.com/apache/incubator-nuttx.git nuttx
git clone --branch=nuttx-12.5.1 https://github.com/apache/incubator-nuttx-apps.git apps
```

## 4. Download bootloader and partition binaries

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

If Ubuntu reports `externally-managed-environment`, that is expected for the system Python. Use the virtual environment above instead of forcing a global install.

Before running `make`, export both required tool locations:

```sh
export PATH=$PATH:/opt/xtensa/xtensa-esp32-elf/bin:$HOME/nuttxspace/.venv/bin
```

## 5. Copy the Aura vest app into `apps`

```sh
rm -rf ~/nuttxspace/apps/examples/aura_vest
cp -r /home/andrei/google-hackathon-2/module-a-vest-new ~/nuttxspace/apps/examples/aura_vest
```

Make sure `~/nuttxspace/apps/Make.defs` contains:

```make
ifneq ($(CONFIG_EXAMPLES_AURA_VEST),)
CONFIGURED_APPS += examples/aura_vest
endif
```

## 6. Configure NuttX for Sparrow

If you use the repository `defconfig` at
`/home/andrei/google-hackathon-2/defconfig`, you can avoid manual
`menuconfig` completely.

Fast path:

```sh
cd ~/nuttxspace
cp /home/andrei/google-hackathon-2/defconfig nuttx/boards/xtensa/esp32/esp32-sparrow-kit/configs/nsh/defconfig
cd nuttx
make distclean
./tools/configure.sh -l -a ../apps esp32-sparrow-kit:nsh
make EXTRAFLAGS="-DESP32_IGNORE_CHIP_REVISION_CHECK" -j4
```

That repository `defconfig` is already Aura-ready. It includes the Sparrow lab
wireless baseline plus the app enablement, GPIO driver, network support library,
and the 4-device PWM layout expected by the vest firmware.

It also disables the onboard RGB LED, I2S microphone, and SD-card/SPI2 support
so those peripherals do not collide with the vest PWM and sensor pin map.

Only use the interactive path below if you want to set those values through
menus instead of editing the defconfig directly.

```sh
cd ~/nuttxspace/nuttx
./tools/configure.sh -l -a ../apps esp32-sparrow-kit:nsh
make menuconfig
```

Inside `menuconfig`, press `/` and search by symbol name without the
`CONFIG_` prefix. Do not expect to see the README values as raw
`CONFIG_...=y` lines.

Useful search terms:

- `EXAMPLES_AURA_VEST`
- `DEV_GPIO`
- `NET`
- `NETDB_DNSCLIENT`
- `ESP32_WIFI`
- `WIRELESS_WAPI`
- `ESP32_LEDC_CHANNEL0_PIN`

Main paths:

- `Application Configuration -> Examples -> Aura Vest embedded app`
- `Device Drivers -> GPIO driver`
- `Device Drivers -> Timer Driver Support`
- `Networking Support`
- `Library Routines -> NETDB Support`
- `Application Configuration -> Network Utilities`
- `Application Configuration -> Wireless Libraries and NSH Add-Ons`
- `System Type -> ESP32 Peripheral Selection -> LEDC Configuration`

Some symbols stay hidden until parent options are enabled. For example,
the TCP and DNS options only appear after you enable `NET`.

At minimum, enable:

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
CONFIG_ESP32_LEDC_CHANNEL0_PIN=25
CONFIG_ESP32_LEDC_CHANNEL1_PIN=26
CONFIG_ESP32_LEDC_CHANNEL2_PIN=27
CONFIG_ESP32_LEDC_CHANNEL3_PIN=33
```

## 7. Build

```sh
make EXTRAFLAGS="-DESP32_IGNORE_CHIP_REVISION_CHECK" -j4
```

That `EXTRAFLAGS` workaround is required for the Sparrow boards used in the lab.

## 8. Flash the board

Find the serial device:

```sh
ls /dev/ttyUSB* /dev/ttyACM* 2>/dev/null
```

If you get a permissions error later, fix serial access with:

```sh
sudo usermod -aG dialout $USER
newgrp dialout
```

Optionally erase flash first:

```sh
esptool --chip esp32 --port /dev/ttyUSB0 erase-flash
```

Put the board in download mode:

1. Hold `BOOT`
2. Press `RESET`
3. Release `BOOT` after the flashing connection is made

Flash using the lab flow:

```sh
cd ~/nuttxspace/nuttx
make flash ESPTOOL_PORT=/dev/ttyUSB0 ESPTOOL_BAUD=115200 ESPTOOL_BINDIR=../esp-bins
```

Alternative direct flash command:

```sh
esptool --chip esp32 --port /dev/ttyUSB0 --baud 921600 write-flash \
  0x1000 ../esp-bins/bootloader-esp32.bin \
  0x8000 ../esp-bins/partition-table-esp32.bin \
  0x10000 nuttx.bin
```

## 9. Open the serial console

```sh
picocom /dev/ttyUSB0 -b 115200
```

Press `Enter` until `nsh>` appears.

## 10. Connect the vest to WiFi and start the app

At the `nsh>` prompt:

```sh
ifup wlan0
wapi psk wlan0 YOUR_SSID YOUR_PASSWORD
renew wlan0
ifconfig wlan0
aura_vest &
```

Read the IP address from `ifconfig wlan0`.

## 11. Connect Android to the vest

In the Android app, enter:

```text
http://<sparrow-ip>:8080
```

and tap `APPLY VEST URL`.

The vest uses WiFi. The watch remains on BLE.