# Sparrow Board Setup

This machine is prepared and the Sparrow firmware build now completes successfully.

## Already done on this machine

- Cloned the Hacktor Watch NuttX repo with submodules into `/home/andrei/hectorwatch-nuttx`
- Downloaded the classic ESP32 Xtensa cross-toolchain into `/home/andrei/.local/xtensa/xtensa-esp32-elf`
- Downloaded the ESP32-S3 Xtensa cross-toolchain into `/home/andrei/.local/xtensa/xtensa-esp32s3-elf`
- Installed `esptool` and `pyserial` into the workspace virtual environment at `/home/andrei/google-hackathon-2/.venv`
- Applied `apps.patch` into `/home/andrei/hectorwatch-nuttx/nuttx-apps`
- Applied the `nuttx.patch` intent manually into `/home/andrei/hectorwatch-nuttx/nuttx/boards/xtensa/esp32/esp32-sparrow-kit/configs/nsh/defconfig`
- Added explicit LX6 and Espressif GNU toolchain symbols to the Sparrow `defconfig` so the generated `.config` uses `xtensa-esp32-elf-*` instead of falling back to host `gcc`

## Remaining host packages

Ubuntu 25.10 has `libncurses-dev` instead of the older `libncurses5-dev` and `libncursesw5-dev` names.

Run:

```sh
sudo apt-get update
sudo apt-get install -y \
  bison flex gettext texinfo gperf automake libtool pkg-config \
  build-essential genromfs libgmp-dev libmpc-dev libmpfr-dev libisl-dev \
  binutils-dev libelf-dev libexpat-dev gcc-multilib g++-multilib \
  picocom u-boot-tools util-linux chrony libusb-dev libusb-1.0-0-dev \
  kconfig-frontends python3-pip libncurses-dev
```

## Environment for the current shell

Run:

```sh
export PATH=/home/andrei/google-hackathon-2/.venv/bin:/home/andrei/.local/xtensa/xtensa-esp32-elf/bin:/home/andrei/.local/xtensa/xtensa-esp32s3-elf/bin:$PATH
source /home/andrei/google-hackathon-2/.venv/bin/activate
```

Optional persistent setup:

```sh
echo 'export PATH=/home/andrei/google-hackathon-2/.venv/bin:/home/andrei/.local/xtensa/xtensa-esp32-elf/bin:/home/andrei/.local/xtensa/xtensa-esp32s3-elf/bin:$PATH' >> ~/.bashrc
echo 'source /home/andrei/google-hackathon-2/.venv/bin/activate' >> ~/.bashrc
source ~/.bashrc
```

## Configure and build Sparrow NuttX

Run:

```sh
cd /home/andrei/hectorwatch-nuttx/nuttx
./tools/configure.sh -l -a ../nuttx-apps esp32-sparrow-kit:nsh
make -j$(nproc)
```

The successful build on this machine produced:

- `/home/andrei/hectorwatch-nuttx/nuttx/nuttx`
- `/home/andrei/hectorwatch-nuttx/nuttx/nuttx.hex`
- `/home/andrei/hectorwatch-nuttx/nuttx/nuttx.bin`

## Flash when the board is reconnected

Check the serial device:

```sh
ls /dev/ttyUSB* /dev/ttyACM* 2>/dev/null
```

Typical serial devices seen on this machine before disconnect were `/dev/ttyACM0` and `/dev/ttyUSB0`.

If flashing fails with `Permission denied` on `/dev/ttyUSB0` or `/dev/ttyACM0`, fix serial permissions first.

Proper fix:

```sh
sudo usermod -aG dialout $USER
newgrp dialout
```

Then unplug and reconnect the board once.

One-shot workaround for the current session:

```sh
sudo chmod a+rw /dev/ttyUSB0
```

Put the ESP32 into download mode:

1. Hold `BOOT`
2. Press `RESET` once
3. Release `BOOT`

Then flash:

```sh
cd /home/andrei/hectorwatch-nuttx/nuttx
export PATH=/home/andrei/google-hackathon-2/.venv/bin:/home/andrei/.local/xtensa/xtensa-esp32-elf/bin:/home/andrei/.local/xtensa/xtensa-esp32s3-elf/bin:$PATH
make flash ESPTOOL_PORT=/dev/ttyACM0 ESPTOOL_BAUD=921600
```

Reset once more after flashing so the board leaves download mode.

The dry-run flash target for this board writes only the app image:

```sh
esptool.py -c esp32 -p /dev/ttyACM0 -b 921600 write_flash -fs detect -fm dio -ff 40m 0x1000 nuttx.bin
```

## Open the NSH console

Run:

```sh
picocom -b 115200 /dev/ttyACM0
```

Press `Enter` a few times to wake NSH.

## Run the demo

At the NSH prompt:

```sh
sparrow_demo
```

The demo cycles the RGB LED, initializes the LTR308 and BME680, and prints sensor output while also drawing basic text through NX on the display.

## Current local patch state

- `/home/andrei/hectorwatch-nuttx/nuttx-apps` has a new `examples/sparrow_demo` directory
- `/home/andrei/hectorwatch-nuttx/nuttx` has extra Sparrow config lines in the board `defconfig`

## Current status

- `./tools/configure.sh -l -a ../nuttx-apps esp32-sparrow-kit:nsh` succeeds
- `make -j4` succeeds and generates `nuttx.bin`
- The only compile-time issue left is a non-fatal warning in `sparrow_demo_main.c` about a struct initializer brace style

`kconfig-frontends` is no longer a blocker on this machine.