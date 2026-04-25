# Aura Vest Firmware

This module contains the vest firmware for Project Aura.

## Scope

- 3-zone ultrasonic polling at a 100ms cadence.
- Distance-to-haptic mapping that matches the project specification.
- BLE sensor payload encoding and haptic override parsing.
- 2-second motor override suspension and automatic resume.
- Battery and sensor status reporting logic.
- DC motor duty compensation so brushed motors on driver modules do not stall on low nonzero commands.

## Layout

- `src/`: firmware sources.
- `test/`: host-side tests for logic that does not require hardware.
- `docs/`: schematic and timing references.
- `.config`: baseline NuttX configuration values for an ESP32-S3 target.

## Host Validation

The hardware-specific pieces are stubbed behind simple drivers so the critical logic can be tested with a normal C compiler.

```sh
make test
```

## NuttX Build Notes

This repository does not include a full NuttX tree. To build on hardware:

1. Use NuttX 12.x with an ESP32-S3 or nRF52840 board support package.
2. Apply `apps.patch` in your NuttX `apps` repository to add the `sparrow_demo` application.
3. Apply `nuttx.patch` in your NuttX `nuttx` repository to enable the Sparrow kit demo configuration.
4. Copy the files from `src/` into your application tree.
5. Merge the values from `.config` into your board configuration.
6. Enable BLE, PWM, timers, and the relevant GPIO drivers.

## DC Motor Driver Notes

- The firmware keeps the BLE intensity contract unchanged and compensates only the hardware PWM output.
- `AURA_DC_MOTOR_MIN_EFFECTIVE_DUTY` sets the minimum duty floor used for any nonzero motor command.
- If you are using plain brushed DC motors instead of dedicated vibration cans, add a small eccentric weight to the shaft so the motor produces tactile vibration.

## Pin Mapping

| Zone | Trigger GPIO | Echo GPIO | Motor Driver PWM GPIO |
| --- | --- | --- | --- |
| Left | 4 | 5 | 18 |
| Center | 6 | 7 | 19 |
| Right | 8 | 9 | 20 |