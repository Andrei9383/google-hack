# Project Aura

An accessibility system providing spatial awareness for visually impaired individuals through two complementary layers: **haptic reflexes** (passive, always-on) and **spoken intelligence** (on-demand, triggered by a WearOS watch).

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Architecture](#architecture)
3. [BLE Communication](#ble-communication)
4. [Modules](#modules)
5. [Quick Start](#quick-start)
6. [Performance Targets](#performance-targets)
7. [Validation](#validation)
8. [Project Structure](#project-structure)
9. [License](#license)

---

## System Overview

| Layer | Device | Modality | Latency | User Action |
|---|---|---|---|---|
| **Reflexes** (passive) | NuttX Vest | Haptic vibration | < 80ms | None — always on |
| **Intelligence** (on-demand) | Android Phone | Text-to-Speech | < 2s | Tap watch |
| **Trigger** (input) | WearOS Watch | Button press / shake | < 200ms round-trip | Intentional |

### Design Principles

- **Fail-safe by default** — The vest works fully standalone with no phone connection.
- **No visual feedback required** — Every UI state has a haptic or audio equivalent.
- **Latency over accuracy** — A fast approximate response beats a slow precise one for obstacle avoidance.
- **Minimal cognitive load** — Speaks only when asked, vibrates only when relevant.

---

## Architecture

```
                    ┌──────────────────────────────────┐
                    │        ANDROID PHONE (Brain)      │
                    │  ┌─────────┐  ┌───────────────┐   │
                    │  │ BLE     │  │ Camera /      │   │
                    │  │ Central │  │ ML Kit        │   │
                    │  └────┬────┘  └───────┬───────┘   │
                    │       │               │           │
                    │  ┌────┴───────────────┴────┐      │
                    │  │   Sensor Fusion + TTS   │      │
                    │  └─────────────────────────┘      │
                    └──────┬───────────────┬────────────┘
              BLE (10Hz)   │               │   BLE (on tap)
          ┌────────────────┘               └────────────────┐
          ▼                                                 ▼
┌──────────────────┐                           ┌──────────────────┐
│  NUTTX VEST      │                           │  WEAROS WATCH    │
│  (Reflexes)      │                           │  (Trigger)       │
│                  │                           │                  │
│  Ultrasonic x3   │                           │  Full-screen     │
│  DC Motors x3    │                           │  tap button      │
│  BLE Peripheral  │                           │  BLE Peripheral  │
└──────────────────┘                           └──────────────────┘
```

Three devices communicate exclusively over Bluetooth Low Energy (BLE 5.0). The vest polls three HC-SR04 ultrasonic sensors continuously, mapping distances to haptic vibration patterns. The phone fuses ultrasonic data with ML Kit camera detections and can override vest vibrations when it sees important objects. The watch delivers a simple, full-screen trigger that requests a spoken scene description from the phone.

---

## BLE Communication

All UUIDs use the base `2E6A0000-C4B2-4D6E-A591-7F8B2D3E1A00` with variant suffixes.

### Vest GATT Service

| Characteristic | UUID suffix | Properties | Payload | Rate |
|---|---|---|---|---|
| Sensor Data | `...0001` | READ \| NOTIFY | `[L_cm, C_cm, R_cm]` 3 bytes | 10 Hz |
| Haptic Override | `...0002` | WRITE \| WRITE_NO_RESPONSE | `[MotorID, Intensity, Pattern]` 3 bytes | On detection |
| System Status | `...0003` | READ \| NOTIFY | `[StatusCode]` 1 byte | 30s heartbeat |

### Watch GATT Service

| Characteristic | UUID suffix | Properties | Payload | Trigger |
|---|---|---|---|---|
| Trigger | `...0005` | WRITE \| WRITE_NO_RESPONSE | `[0x01]` 1 byte | Tap or shake |

### Payload Reference

**Sensor Data (Vest → Phone):**
```
Byte 0: Left distance   (0–255 cm; 0xFF = clear)
Byte 1: Center distance (0–255 cm; 0xFF = clear)
Byte 2: Right distance  (0–255 cm; 0xFF = clear)
```

**Haptic Override (Phone → Vest):**
```
Byte 0: Motor ID   — 0x01=Left, 0x02=Center, 0x03=Right
Byte 1: Intensity  — 0x00=Off, 0xFF=Max (linear)
Byte 2: Pattern    — 0x00=Static, 0x01=Heartbeat, 0x02=Danger
```

---

## Modules

### Module A — NuttX Vest ("The Reflexes")

**Language:** C (NuttX RTOS 12.x) | **Target:** ESP32-S3 or nRF52840

Continuously polls 3 ultrasonic sensors (HC-SR04) at 100ms intervals and maps distances to PWM haptic intensities across six vibration bands. Accepts 2-second haptic overrides from the phone via BLE and reports battery/sensor status.

See [module-a-vest/README.md](module-a-vest/README.md) for build instructions, pin mapping, and host-side test commands.

### Module B — Android App ("The Brain")

**Stack:** React Native (Expo SDK 54), TypeScript, Kotlin native module | **Target:** Android 10+

BLE central connecting to both vest and watch. Runs ML Kit object detection on camera snapshots, fuses ultrasonic + vision data, sends haptic overrides, and speaks scene descriptions via TTS on watch trigger. Includes a local Expo native module (`modules/aura-native/`) for ML Kit integration and foreground service.

See [module-b-android/README.md](module-b-android/README.md) for setup, permissions, and native module details.

### Module C — WearOS App ("The Trigger")

**Language:** Kotlin (Jetpack Compose) | **Target:** WearOS 3.0+

BLE peripheral with a single full-screen tap target. Notifies `[0x01]` to the phone on tap or wrist-shake. Provides local haptic confirmation and a connection status dot (green/red). Shake detection uses accelerometer with 3-spike threshold (>2.5G) and 3-second cooldown.

See [module-c-wearos/README.md](module-c-wearos/README.md) for build and sideload instructions.

---

## Quick Start

### Prerequisites

- **Vest:** ESP32-S3 or nRF52840 dev board, 3× HC-SR04, 3× DC motors with driver modules, LiPo battery
- **Phone:** Android 10+ with BLE 5.0 and rear camera
- **Watch:** WearOS 3.0+ device
- **Dev machine:** Node 20+, Android Studio (Hedgehog+), NuttX 12.x toolchain

### Build & Flash

**Vest:**
```sh
cd module-a-vest
make test                    # run host-side tests first

# For NuttX hardware build (requires separate NuttX tree):
# 1. Apply nuttx.patch and apps.patch to your NuttX repositories
# 2. Merge .config values into your board defconfig
# 3. Copy src/ into your NuttX application
# 4. Build and flash per your board's instructions
```

**Android App:**
```sh
cd module-b-android
npm install
npx expo prebuild --platform android
npm run android              # or: expo run:android
```

**WearOS App:**
```sh
cd module-c-wearos
./gradlew assembleDebug
./gradlew installDebug       # sideload to connected watch
```

### Hardware Wiring

| Zone | Trigger GPIO | Echo GPIO | Motor PWM GPIO |
|---|---|---|---|
| Left | 4 | 5 | 18 |
| Center | 6 | 7 | 19 |
| Right | 8 | 9 | 20 |

> Adjust GPIO numbers per your target board's BSP. Motors must be driven through proper motor driver modules (e.g., DRV8833, TB6612).

### Integration Check

1. Power on the vest — verify BLE advertising (use nRF Connect app)
2. Launch Android app — should auto-connect to vest within 5s
3. Launch WearOS app — green connection dot confirms phone link
4. Hold hand ~40cm from center sensor — center motor should pulse rapidly
5. Tap the watch — phone reads scene description via TTS within 2s

---

## Performance Targets

| Path | Budget |
|---|---|
| Sensor → motor vibration (vest local) | < 80ms |
| BLE notify (vest → phone) | < 50ms |
| ML Kit detection (per processed frame) | < 60ms |
| Watch tap → TTS speech begins | < 2000ms |
| BLE write (phone → vest, haptic override) | < 100ms |
| App cold start → fully operational | < 8s |

### Battery Life

| Device | Runtime Target |
|---|---|
| Vest (2000mAh LiPo) | ≥ 8 hours |
| Phone (screen-on, BLE + camera) | ≥ 6 hours |
| Watch (BLE advertising + standby) | ≥ 12 hours |

---

## Validation

### Module A (Vest)
```sh
cd module-a-vest && make test
```
Runs 6 host-side C test suites covering distance conversion, DC motor compensation, haptic mapping, BLE payload encoding, haptic patterns, and override state logic.

### Module B (Android)
```sh
cd module-b-android
npm test                        # Jest unit tests
npm run typecheck               # tsc --noEmit
```

### Module C (WearOS)
```sh
cd module-c-wearos && ./gradlew test
```
JUnit test verifying UUID constants match the specification.

---

## Project Structure

```
google-hack/
├── SPECIFICATION.md              # Complete system specification
├── SPARROW_BOARD_SETUP.md        # NuttX build environment guide
├── apps.patch                    # NuttX apps tree patch
├── nuttx.patch                   # NuttX defconfig patch
├── module-a-vest/                # Vest firmware (C, NuttX)
│   ├── src/                      #   Firmware sources
│   ├── test/                     #   Host-side C tests
│   ├── docs/                     #   Timing diagram & schematic
│   └── .config                   #   NuttX baseline config
├── module-b-android/             # Android app (React Native/Expo + Kotlin)
│   ├── src/                      #   TypeScript application
│   │   ├── ble/                  #   BLE central + protocol
│   │   ├── vision/               #   Camera + ML Kit pipeline
│   │   ├── fusion/               #   Sensor fusion logic
│   │   ├── tts/                  #   Text-to-speech engine
│   │   ├── state/                #   Zustand system store
│   │   └── ui/                   #   React Native screens
│   └── modules/aura-native/      #   Expo native module (Kotlin)
└── module-c-wearos/              # WearOS app (Kotlin/Jetpack Compose)
    └── app/src/main/kotlin/com/google/aura/watch/
        ├── ble/                  #   BLE peripheral + advertising
        ├── sensors/              #   Shake trigger detector
        └── ui/                   #   Trigger screen + view model
```


