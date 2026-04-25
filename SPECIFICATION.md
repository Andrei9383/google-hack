# Project Aura — Complete Modular Specification
**Version:** 1.0 (MVP)
**Theme:** Accessibility, Health & Safety
**Target Users:** Visually impaired individuals (primary), caregivers (secondary)

---

## Table of Contents
1. [System Overview](#1-system-overview)
2. [Architecture Contract](#2-architecture-contract)
3. [Module A — NuttX Vest ("The Reflexes")](#3-module-a--nuttx-vest-the-reflexes)
4. [Module B — Android App ("The Brain")](#4-module-b--android-app-the-brain)
5. [Module C — WearOS App ("The Trigger")](#5-module-c--wearos-app-the-trigger)
6. [BLE Communication Protocol](#6-ble-communication-protocol)
7. [Sensor Fusion Logic](#7-sensor-fusion-logic)
8. [TTS Output Specification](#8-tts-output-specification)
9. [System States & Error Handling](#9-system-states--error-handling)
10. [Performance & Latency Budget](#10-performance--latency-budget)
11. [Testing Requirements Per Module](#11-testing-requirements-per-module)
12. [Build & Delivery Checklist](#12-build--delivery-checklist)

---

## 1. System Overview

### 1.1 Concept
A three-device accessibility system giving visually impaired users two complementary layers of spatial awareness:

| Layer | Device | Modality | Latency Target | User Action |
|---|---|---|---|---|
| **Reflexes** (passive) | NuttX Vest | Haptic vibration | < 80ms | None — always on |
| **Intelligence** (on-demand) | Android Phone | Text-to-Speech audio | < 2s | Tap watch button |
| **Trigger** (input) | WearOS Watch | Single button press | < 200ms BLE round-trip | Intentional tap |

### 1.2 Design Principles
1. **Fail-safe by default** — Vest must function fully with no phone connection.
2. **No visual feedback required** — Every UI state must have a haptic or audio equivalent.
3. **Latency over accuracy** — For obstacle avoidance, a fast approximate response beats a slow precise one.
4. **Minimal cognitive load** — The system speaks only when asked; it vibrates only when relevant.

### 1.3 Hardware Bill of Materials

**Vest (NuttX Node)**
| Component | Quantity | Notes |
|---|---|---|
| ESP32-S3 or nRF52840 | 1 | Must support BLE 5.0 + NuttX BSP |
| HC-SR04 Ultrasonic Sensor | 3 | Left, Center, Right chest placement |
| Small brushed DC motor (3V) | 3 | One per sensor zone; add an eccentric weight if the motor is not already a vibration motor |
| Motor driver channel (e.g., DRV8833 / TB6612 / similar) | 3 | Drive motors from a proper driver stage — do NOT drive them directly from GPIO |
| LiPo Battery (3.7V, 2000mAh) | 1 | Min 8hr runtime target |
| Power switch | 1 | Latching, accessible to gloved hands |

**Android Phone (Brain Node)**
- Android 10+ with BLE 5.0
- Rear camera capable of 30fps at 720p minimum
- Worn on chest strap or lanyard, rear camera facing outward
- Wired earbuds or bone-conduction headphones (for situational audio awareness)

**WearOS Watch (Trigger Node)**
- WearOS 3.0+ (Wear OS by Google, not Samsung Tizen)
- BLE 5.0
- Minimum 1.4" display for large button target

---

## 2. Architecture Contract

This section defines the hard boundaries between modules. Any AI agent building a single module must treat these as immutable interfaces.

```
┌─────────────────────────────────────────────────────────────┐
│                    SYSTEM DATA FLOW                         │
│                                                             │
│  [HC-SR04 x3] ──poll──► [NuttX MCU]                        │
│                              │                              │
│                    BLE Characteristic 1                     │
│                    (Sensor Data, 10Hz, Notify)              │
│                              │                              │
│                              ▼                              │
│  [WearOS]────BLE Char 3────► [Android App] ◄─── [Camera]   │
│             (Trigger)            │         ML Kit           │
│                                  │                          │
│                    ┌─────────────┴────────────┐             │
│                    │                          │             │
│            BLE Char 2                    react-native-tts   │
│          (Haptic Override)               (to headphones)    │
│                    │                                        │
│                    ▼                                        │
│              [NuttX MCU]                                    │
│              [Motors x3]                                    │
└─────────────────────────────────────────────────────────────┘
```

### 2.1 Module Boundaries (Strict)

| From | To | Interface | Format |
|---|---|---|---|
| NuttX Vest | Android App | BLE Char 1 (Notify) | `[L_cm, C_cm, R_cm]` 3 bytes |
| Android App | NuttX Vest | BLE Char 2 (Write) | `[MotorID, Intensity, Pattern]` 3 bytes |
| WearOS Watch | Android App | BLE Char 3 (Write) | `[0x01]` 1 byte |
| Android App | Headphones | System Audio (TTS) | Formatted UTF-8 string (see §8) |

No module may depend on the internal implementation of another. All dependencies are through the above interfaces only.

---

## 3. Module A — NuttX Vest ("The Reflexes")

**Agent Deliverable:** Firmware binary + source, buildable with NuttX menuconfig for ESP32-S3 or nRF52840.

### 3.1 Responsibilities
- Continuously poll 3 ultrasonic sensors
- Map distances to PWM motor intensities
- Broadcast sensor data via BLE at 10Hz
- Accept and apply haptic override commands from Android
- Manage BLE connection lifecycle independently

### 3.2 Hardware Pin Mapping
```
Sensor Zone │ Trig GPIO │ Echo GPIO │ Motor PWM GPIO │ Driver Input
────────────┼───────────┼───────────┼────────────────┼─────────────
Left        │   GPIO 4  │   GPIO 5  │    GPIO 18     │  PWM/EN
Center      │   GPIO 6  │   GPIO 7  │    GPIO 19     │  PWM/EN
Right       │   GPIO 8  │   GPIO 9  │    GPIO 20     │  PWM/EN
```
> Adjust GPIO numbers per your target board's BSP. These are illustrative for ESP32-S3.

### 3.3 Sensor Polling Loop

**Timing:** Poll cycle = 100ms total (10Hz). Each sensor gets a dedicated non-overlapping trigger window to prevent echo cross-talk.

```
t=0ms   → Trigger LEFT sensor (10µs pulse)
t=5ms   → Read LEFT echo, convert to cm
t=33ms  → Trigger CENTER sensor
t=38ms  → Read CENTER echo, convert to cm
t=66ms  → Trigger RIGHT sensor
t=71ms  → Read RIGHT echo, convert to cm
t=95ms  → Update BLE characteristic, update motor PWM
t=100ms → Repeat
```

**Distance Conversion (HC-SR04):**
```
distance_cm = (echo_pulse_width_µs / 58.0)
```
Clamp output: min = 2cm, max = 400cm. If echo timeout (>38ms), treat as `400cm` (no obstacle).

### 3.4 Distance-to-Vibration Mapping

This is the core haptic language. The mapping must be consistent and never change without updating user documentation.

| Distance Range | Intensity (PWM duty) | Pattern | Description |
|---|---|---|---|
| > 200cm | 0% | None (off) | Clear path |
| 150–200cm | 15% | Slow pulse (1Hz) | Distant awareness |
| 100–150cm | 35% | Medium pulse (2Hz) | Approaching |
| 50–100cm | 65% | Fast pulse (4Hz) | Near obstacle |
| 20–50cm | 90% | Rapid pulse (8Hz) | Very close |
| < 20cm | 100% | Continuous (on) | Immediate danger |

**Pulse implementation:** A "1Hz pulse" means motor ON for 500ms, OFF for 500ms. Generate this with a software timer in the main loop; do not block.

When using small brushed DC motors through a motor driver, remap any nonzero PWM command into the motor's effective range so low-intensity patterns still overcome stall torque.

### 3.5 BLE Override Handling (Characteristic 2 — Write)

When the Android App sends a 3-byte override `[MotorID, Intensity, Pattern]`:

1. Apply the override immediately to the specified motor.
2. Start a **2-second override timer** for that motor zone.
3. While override is active, the distance-to-vibration mapping for that zone is **suspended**.
4. When the timer expires, resume normal distance-based control for that zone.
5. A new override resets the timer.

**Pattern byte values:**
```
0x00 = Static Object   → Motor ON at Intensity, no pulse
0x01 = Dynamic Object  → Heartbeat pattern: 200ms ON, 100ms OFF, 200ms ON, 500ms OFF
0x02 = Danger          → Continuous at Intensity (same as distance < 20cm)
```

### 3.6 BLE Peripheral Setup

- **Role:** GATT Server (Peripheral)
- **Advertising:** Always advertising when powered on
- **Advertising interval:** 100ms
- **Connection:** Accept one central connection at a time (Android phone)
- **Security:** No bonding required for MVP; open connection

**Characteristic 1 (Sensor Data):**
- UUID: `AURA0001-...` (see §6)
- Properties: `READ | NOTIFY`
- Update rate: 10Hz when central is subscribed
- Value: `[L_cm, C_cm, R_cm]` — each byte is distance in cm, unsigned. For distances > 255cm, clamp to `0xFF`.

**Characteristic 2 (Haptic Override):**
- UUID: `AURA0002-...` (see §6)
- Properties: `WRITE | WRITE_WITHOUT_RESPONSE`
- On write: parse `[MotorID, Intensity, Pattern]` and apply override (§3.5)

### 3.7 System Status Haptics

These fire on **all three motors simultaneously** to indicate system state (not obstacle avoidance):

| Event | Pattern | Duration |
|---|---|---|
| Power on | Single 300ms buzz | Once |
| BLE connected (phone) | Two short pulses (100ms each) | Once |
| BLE disconnected | Three slow pulses (500ms each) | Once |
| Low battery (<15%) | Single pulse every 30 seconds | Repeating |
| Critical battery (<5%) | Rapid triple-pulse every 10 seconds | Repeating |

### 3.8 Power Management
- Implement light sleep between sensor polls when BLE is idle
- BLE: use connection interval of 50ms when connected, 100ms advertising otherwise
- Target: < 150mA average draw at 3.7V = ~13 hours on 2000mAh

### 3.9 Build Requirements
- NuttX version: 12.x (latest stable)
- Toolchain: `xtensa-esp32s3-elf` (ESP32-S3) or `arm-none-eabi` (nRF52840)
- Required NuttX configs: `CONFIG_BLE`, `CONFIG_PWM`, `CONFIG_HCSR04`, `CONFIG_TIMER`
- Deliverable: `aura_vest.bin` + NuttX `.config` file + build instructions in `README.md`

---

## 4. Module B — Android App ("The Brain")

**Agent Deliverable:** React Native (Bare CLI) project, buildable with `npx react-native run-android`.

### 4.1 Tech Stack
```
React Native (Bare CLI, not Expo Go)
├── react-native-vision-camera v4+     (camera + frame processors)
├── react-native-ble-plx               (BLE central role)
├── react-native-tts                   (text-to-speech)
├── @tensorflow/tfjs-react-native      (optional: custom model fallback)
└── Native module: MLKit (via Frame Processor plugin)
    └── vision-camera-plugin-frame-processor-mlkit-object-detection
```

### 4.2 App Architecture

```
src/
├── ble/
│   ├── BLEManager.ts          ← Vest connection + Watch connection
│   ├── VestProtocol.ts        ← Encode/decode vest payloads
│   └── WatchProtocol.ts       ← Decode watch trigger
├── vision/
│   ├── CameraProcessor.ts     ← VisionCamera frame processor
│   ├── ZoneClassifier.ts      ← Map bounding boxes to L/C/R zones
│   └── ObjectFilter.ts        ← Filter/prioritize detected objects
├── fusion/
│   └── SensorFusion.ts        ← Reconcile ultrasonic + ML Kit data
├── tts/
│   ├── TTSEngine.ts           ← Wrap react-native-tts
│   └── SceneFormatter.ts      ← Format object array into speech string
├── state/
│   └── SystemStore.ts         ← Zustand or Redux store (system state)
└── ui/
    ├── StatusScreen.tsx        ← Single-screen UI (see §4.8)
    └── PermissionsGate.tsx     ← Camera + BLE permissions flow
```

### 4.3 BLE Central Role — Vest Connection

**Connection lifecycle:**
1. On app launch, scan for devices advertising service UUID `AURA-MAIN-SVC` (see §6)
2. Connect automatically (no user action required)
3. Subscribe to Characteristic 1 (Sensor Data) immediately after connecting
4. On disconnect: begin aggressive reconnection loop (retry every 3 seconds, indefinitely)
5. System-status haptic: fire "disconnected" pattern (§3.7) via TTS announcement: *"Vest disconnected. Reconnecting."*

**Sensor data handling (10Hz incoming):**
- Parse `[L_cm, C_cm, R_cm]` from each notification
- Store latest values in `SystemStore` as `vestSensorData: { left, center, right, timestamp }`
- Feed into SensorFusion module (§7)

### 4.4 BLE Central Role — Watch Connection

The watch also acts as a BLE peripheral. The phone connects to it as a second central connection.

1. Simultaneously scan for watch advertising service UUID `AURA-WATCH-SVC` (see §6)
2. Subscribe to Characteristic 3 (Trigger)
3. On `[0x01]` received: trigger TTS readout (§8) within 200ms

### 4.5 Camera & ML Kit Pipeline

**Frame processor configuration:**
```javascript
// Frame rate throttling to preserve battery
const frameProcessor = useFrameProcessor((frame) => {
  'worklet';
  // Only process every 3rd frame (10fps effective at 30fps camera)
  if (frameCount % 3 !== 0) return;
  
  const results = detectObjects(frame, {
    classificationConfidenceThreshold: 0.65,
    maxPerObjectLabelCount: 1,
  });
  
  runOnJS(handleDetections)(results, frame.width, frame.height);
}, []);
```

**Zone classification:**
Split the frame into thirds by bounding box center-X:
```
Zone boundary LEFT  = frame.width * 0.33
Zone boundary RIGHT = frame.width * 0.66

if (bbox.centerX < LEFT_BOUNDARY)  → zone = 'left'
if (bbox.centerX > RIGHT_BOUNDARY) → zone = 'right'
else                                → zone = 'center'
```

**Object priority tiers (for haptic override decisions):**

| Tier | Labels | Action |
|---|---|---|
| DANGER | `person`, `bicycle`, `motorcycle`, `car` | Fire `0x02` (Danger) haptic override |
| DYNAMIC | `dog`, `cat`, `bird`, `sports ball` | Fire `0x01` (Dynamic) haptic override |
| STATIC | All other labeled objects | Fire `0x00` (Static) haptic override |
| IGNORE | Confidence < 0.65 | No action |

Only fire a haptic override if the detected object is **closer than the ultrasonic sensor's reading** would suggest concern (i.e., `vest.center_cm < 150`). This prevents spurious overrides for distant objects.

### 4.6 Haptic Override Command Construction
```typescript
// VestProtocol.ts
export function buildHapticOverride(
  zone: 'left' | 'center' | 'right',
  tier: 'DANGER' | 'DYNAMIC' | 'STATIC'
): Uint8Array {
  const motorId = { left: 0x01, center: 0x02, right: 0x03 }[zone];
  const intensity = { DANGER: 0xFF, DYNAMIC: 0xB0, STATIC: 0x70 }[tier];
  const pattern  = { DANGER: 0x02, DYNAMIC: 0x01, STATIC: 0x00 }[tier];
  return new Uint8Array([motorId, intensity, pattern]);
}
```

### 4.7 Sensor Fusion (see also §7)
Before firing any haptic override, consult the SensorFusion module. The fusion module may suppress the override if the vest is already providing an equivalent or stronger haptic for that zone.

### 4.8 App UI (Minimal — Accessibility First)

The screen is not the primary interface; the user cannot see it. The UI exists for caregiver setup and quick status glancing.

**Single screen layout:**
```
┌──────────────────────────────────────┐
│  [•] AURA ACTIVE         [battery%] │
│                                      │
│  VEST    ● Connected                 │
│  WATCH   ● Connected                 │
│  CAMERA  ● Active                    │
│                                      │
│  LEFT    ████░░░░  87cm              │
│  CENTER  ██░░░░░░  130cm             │
│  RIGHT   ░░░░░░░░  clear             │
│                                      │
│  Last scene: "1 person center,       │
│  2 chairs left, 1 table right"       │
│                                      │
│  [  DESCRIBE SCENE NOW  ] ← fallback │
└──────────────────────────────────────┘
```

**Accessibility requirements for the UI:**
- All status elements have `accessibilityLabel` props
- "DESCRIBE SCENE NOW" button is the fallback trigger if watch is unavailable
- No interaction required during normal use — app is fully background-capable

### 4.9 Permissions Required (Android Manifest)
```xml
<uses-permission android:name="android.permission.BLUETOOTH_SCAN" />
<uses-permission android:name="android.permission.BLUETOOTH_CONNECT" />
<uses-permission android:name="android.permission.BLUETOOTH_ADVERTISE" />
<uses-permission android:name="android.permission.CAMERA" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.WAKE_LOCK" />
```

The app must run as a **Foreground Service** with a persistent notification so Android does not kill it.

### 4.10 Build Requirements
- Node 20+, React Native 0.73+
- Android minSdkVersion: 26, targetSdkVersion: 34
- `react-native-vision-camera` requires JSI / Reanimated worklet support (included in Bare CLI; do not use Expo Go)
- Deliverable: APK + source, with `README.md` covering build steps and native module linking

---

## 5. Module C — WearOS App ("The Trigger")

**Agent Deliverable:** Android Studio project (Kotlin), targeting WearOS 3.0+.

### 5.1 Responsibilities
- Advertise as a BLE peripheral with service UUID `AURA-WATCH-SVC`
- Provide a single full-screen tap button
- On tap: write `[0x01]` to Characteristic 3
- Optionally: detect a wrist-shake gesture as an alternative trigger

### 5.2 UI Specification

```
┌────────────────┐
│                │
│                │
│   DESCRIBE     │  ← Full screen is tappable
│   SURROUNDINGS │
│                │
│    [   ]       │  ← Status indicator dot
│                │    Green = Phone connected
└────────────────┘    Red = Disconnected
```

- Background: **Black** (OLED battery optimization)
- Text: White, large (min 24sp), center-aligned
- Status dot: 12dp circle, color-coded per connection state
- No other UI elements; the entire screen surface is the tap target

### 5.3 Haptic Confirmation on Trigger
On button press, fire the watch's built-in vibrator:
```kotlin
val vibrator = getSystemService(Vibrator::class.java)
vibrator.vibrate(VibrationEffect.createOneShot(80, VibrationEffect.DEFAULT_AMPLITUDE))
```

### 5.4 BLE Peripheral Setup (Kotlin)

```kotlin
// Service UUID (must match §6 exactly)
val WATCH_SERVICE_UUID = UUID.fromString("2E6A0004-C4B2-4D6E-A591-7F8B2D3E1A00")
val TRIGGER_CHAR_UUID  = UUID.fromString("2E6A0005-C4B2-4D6E-A591-7F8B2D3E1A00")

// Characteristic setup
val triggerChar = BluetoothGattCharacteristic(
    TRIGGER_CHAR_UUID,
    BluetoothGattCharacteristic.PROPERTY_WRITE or 
    BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE,
    BluetoothGattCharacteristic.PERMISSION_WRITE
)
```

The watch is the **peripheral/server**; the phone is the **central/client** that connects to it and subscribes.

### 5.5 Shake-to-Trigger (Optional — MVP+)
Detect a wrist-shake gesture using the watch accelerometer:
- Threshold: 3 axis acceleration spikes > 2.5G within 500ms
- Cooldown: 3 seconds between shake-triggers (prevent accidental double-fires)
- Implement using `SensorManager` with `TYPE_ACCELEROMETER`

### 5.6 Build Requirements
- Android Studio Hedgehog or newer
- `compileSdk = 34`, `targetSdk = 34`
- `wearable: true` in manifest
- Kotlin 1.9+
- Deliverable: `.apk` sideloadable to WearOS watch + source

---

## 6. BLE Communication Protocol

### 6.1 UUIDs (Corrected & Complete)

All UUIDs follow the standard 8-4-4-4-12 format.

```
VEST GATT SERVICE:
  Service UUID:         2E6A0000-C4B2-4D6E-A591-7F8B2D3E1A00

  Characteristic 1:     2E6A0001-C4B2-4D6E-A591-7F8B2D3E1A00
  (Sensor Data)         Properties: READ | NOTIFY
                        Payload: [L_cm, C_cm, R_cm] — 3 bytes unsigned

  Characteristic 2:     2E6A0002-C4B2-4D6E-A591-7F8B2D3E1A00
  (Haptic Override)     Properties: WRITE | WRITE_WITHOUT_RESPONSE
                        Payload: [MotorID, Intensity, Pattern] — 3 bytes

  Characteristic 3:     2E6A0003-C4B2-4D6E-A591-7F8B2D3E1A00
  (System Status)       Properties: READ | NOTIFY
                        Payload: [StatusCode] — 1 byte (see §6.3)

WATCH GATT SERVICE:
  Service UUID:         2E6A0004-C4B2-4D6E-A591-7F8B2D3E1A00

  Characteristic 1:     2E6A0005-C4B2-4D6E-A591-7F8B2D3E1A00
  (Trigger)             Properties: WRITE | WRITE_WITHOUT_RESPONSE
                        Payload: [0x01] — 1 byte
```

### 6.2 Payload Reference

**Characteristic 1 — Sensor Data (Vest → Phone)**
```
Byte 0: Left distance   (0–255 cm; 0xFF = clear / > 255cm)
Byte 1: Center distance (0–255 cm; 0xFF = clear / > 255cm)
Byte 2: Right distance  (0–255 cm; 0xFF = clear / > 255cm)
```

**Characteristic 2 — Haptic Override (Phone → Vest)**
```
Byte 0: Motor ID
        0x01 = Left motor
        0x02 = Center motor
        0x03 = Right motor
        0xFF = All motors (system status pattern)

Byte 1: Intensity
        0x00 = Off
        0xFF = Maximum
        (Linear scale, maps to PWM duty cycle)

Byte 2: Pattern
        0x00 = Static (constant on at intensity)
        0x01 = Dynamic / Heartbeat (200ms on, 100ms off, 200ms on, 500ms off)
        0x02 = Danger / Continuous (same as static but reserved for danger)
        0x03 = System pulse (used internally; phone should not send this)
```

**Characteristic 3 — System Status (Vest → Phone)**
```
Byte 0: Status Code
        0x00 = OK / Normal
        0x01 = Low battery (< 15%)
        0x02 = Critical battery (< 5%)
        0x03 = Sensor fault (one or more ultrasonic sensors not responding)
```

**Watch Characteristic 1 — Trigger (Watch → Phone)**
```
Byte 0: 0x01 = Request scene description
```
> Reserved for future: `0x02` = request navigation mode, `0x03` = emergency SOS

### 6.3 Heartbeat / Connection Keep-Alive
- Vest sends Characteristic 3 status update every **30 seconds** regardless of changes
- If the Android App does not receive a Characteristic 1 update within **5 seconds**, it should announce via TTS: *"Vest signal lost. Check connection."*
- Phone must implement reconnection with **exponential backoff**: 1s, 2s, 4s, 8s, max 30s intervals

---

## 7. Sensor Fusion Logic

The SensorFusion module runs on Android and reconciles potentially conflicting signals from the vest (ultrasonic) and ML Kit (camera).

### 7.1 Problem Statement
- Ultrasonic sensors measure **distance** but are blind to object **type**
- ML Kit detects **objects** but bounding box size is an unreliable distance proxy
- Both may report an obstacle in the same zone; sending two conflicting haptic signals would confuse the user

### 7.2 Fusion Rules

```typescript
// SensorFusion.ts
interface FusionInput {
  vest: { left: number; center: number; right: number }; // cm
  mlkit: Detection[]; // { zone, label, tier, confidence }
}

interface FusionOutput {
  hapticOverrides: HapticCommand[]; // what to send to vest
  sceneObjects: Detection[];        // what to include in TTS
}

function fuse(input: FusionInput): FusionOutput {
  const overrides: HapticCommand[] = [];

  for (const zone of ['left', 'center', 'right'] as const) {
    const vestCm = input.vest[zone];
    const zoneDetections = input.mlkit.filter(d => d.zone === zone);
    const topDetection = zoneDetections.sort(byPriorityThenConfidence)[0];

    if (!topDetection) continue; // No ML Kit object in this zone; vest handles it natively

    // Only send override if vest is already indicating proximity concern
    // (avoids overriding for objects the vest already deems safe distance)
    if (vestCm > 200 && topDetection.tier !== 'DANGER') continue;

    // If ML Kit detects DANGER but vest says clear, still override (camera sees ahead, sonar may miss)
    overrides.push(buildHapticOverride(zone, topDetection.tier));
  }

  return { hapticOverrides: overrides, sceneObjects: input.mlkit };
}
```

### 7.3 Override Suppression Rules
| Condition | Action |
|---|---|
| Vest reporting < 20cm in a zone AND ML Kit sends DANGER for same zone | Suppress ML Kit override; vest is already at max intensity |
| ML Kit detects DANGER, vest shows > 200cm (sonar missed it) | Send override immediately regardless |
| Two detections in same zone, different tiers | Send only the highest-tier command |
| Override cooldown: same zone, same tier within 500ms | Suppress duplicate |

---

## 8. TTS Output Specification

### 8.1 Trigger Conditions
The TTS engine fires in two scenarios:
1. **Watch trigger received** (`[0x01]`) — Full scene readout
2. **System event** — Status announcements (see §8.3)

### 8.2 Scene Description Format

**Template:**
```
"{ObjectList}. {ProximityWarning}."
```

**ObjectList construction rules:**
1. Include only objects with confidence ≥ 0.65
2. Group by zone: left objects first, then center, then right
3. Aggregate counts: "2 people" not "person, person"
4. Limit to 5 objects maximum; if more, say "and [N] other objects"
5. Omit zones with no detections

**ProximityWarning:**
- Include only if any zone has distance < 100cm
- Format: "Closest obstacle: [distance]cm [zone]"

**Examples:**
```
"1 person ahead, 2 chairs to your left. Closest obstacle: 80cm center."
"Clear path ahead. 1 table to your right."
"3 people ahead and to the left, and 2 other objects. Closest obstacle: 45cm center."
"Nothing detected."
```

### 8.3 System Event Announcements

| Event | TTS String |
|---|---|
| BLE connected | *"Vest connected."* |
| BLE disconnected | *"Vest disconnected. Reconnecting."* |
| Watch connected | *"Watch connected."* |
| Low battery (vest) | *"Vest battery low."* |
| Critical battery (vest) | *"Warning: vest battery critical."* |
| Sensor fault | *"Warning: vest sensor fault. Check hardware."* |
| Camera unavailable | *"Camera unavailable. Haptic mode only."* |
| App resumed from background | *"Aura active."* |

### 8.4 TTS Configuration
```typescript
// TTSEngine.ts
Tts.setDefaultRate(0.52);        // Slightly faster than default
Tts.setDefaultPitch(1.0);
Tts.setDefaultLanguage('en-US');

// Queue behavior: system events interrupt scene descriptions
// Scene descriptions do NOT interrupt each other (queue)
async function speak(text: string, priority: 'system' | 'scene') {
  if (priority === 'system') {
    await Tts.stop(); // interrupt anything playing
  }
  Tts.speak(text);
}
```

---

## 9. System States & Error Handling

### 9.1 System State Machine

```
                    ┌─────────────┐
                    │  BOOTING    │
                    └──────┬──────┘
                           │ permissions granted
                    ┌──────▼──────┐
              ┌─────┤  SCANNING   ├─────┐
              │     └─────────────┘     │
              │  vest found        watch found
              │                         │
     ┌────────▼────────┐    ┌───────────▼───────────┐
     │ VEST_CONNECTED  │    │    WATCH_CONNECTED     │
     └────────┬────────┘    └───────────┬───────────┘
              │                         │
              └────────┬────────────────┘
                       │ both connected
                ┌──────▼──────┐
                │  FULLY      │  ← Normal operating state
                │  ACTIVE     │
                └──────┬──────┘
                       │
              ┌────────┴────────┐
              │                 │
     ┌────────▼──┐        ┌─────▼───────┐
     │  HAPTIC   │        │    TTS      │
     │  OVERRIDE │        │  READOUT   │
     └────────┬──┘        └─────┬───────┘
              └────────┬────────┘
                       │
                ┌──────▼──────┐
                │  FULLY      │
                │  ACTIVE     │
                └─────────────┘
```

**Degraded states:**
- `VEST_ONLY`: No watch, no camera — haptics only. Announce via TTS on phone speaker.
- `WATCH_ONLY`: Vest disconnected — TTS readout still works on trigger; no haptics. Announce.
- `PHONE_ONLY`: Both disconnected — vest operates on ultrasonic only (autonomous mode). Vest announces via system haptic status pattern.

### 9.2 Error Recovery Table

| Error | Detection Method | Recovery Action | User Notification |
|---|---|---|---|
| Vest BLE disconnect | No Char1 notify in 5s | Restart BLE scan, exponential backoff | TTS: "Vest disconnected" |
| Watch BLE disconnect | Connection callback | Restart BLE scan | TTS: "Watch disconnected" |
| Camera permission denied | PermissionsGate | Show setup screen, disable ML Kit | TTS: "Camera unavailable, haptic mode only" |
| ML Kit crash | try/catch in frame processor | Disable frame processor, log error | TTS: "Vision unavailable" |
| Ultrasonic sensor stuck | Same reading for > 2s | Flag zone as FAULT, set distance to 0xFF | Vest: `[0xFF, 0x60, 0x01]` to all motors + Char3 `0x03` |
| Android app killed by OS | Foreground service | Auto-restart via service | TTS on restart: "Aura active" |

---

## 10. Performance & Latency Budget

These are hard requirements for a safety-critical wearable.

| Path | Budget | How to Measure |
|---|---|---|
| Sensor reading → Motor vibration (vest only) | **< 80ms** | GPIO oscilloscope trace |
| BLE notification (vest → phone) | **< 50ms** | Characteristic callback timestamp delta |
| ML Kit detection (per processed frame) | **< 60ms** | Frame processor timing |
| Watch button tap → TTS speech begins | **< 2000ms** | Manual stopwatch test |
| BLE write (phone → vest, haptic override) | **< 100ms** | BLE write callback timestamp |
| App cold start → fully operational | **< 8s** | App launch timing |

### 10.1 Battery Targets

| Device | Target Runtime | Measurement Method |
|---|---|---|
| Vest | ≥ 8 hours | Discharge test at room temperature, normal use simulation |
| Phone | ≥ 6 hours | Screen-on background service, BLE + camera active |
| Watch | ≥ 12 hours | BLE advertising + standby (WearOS manages aggressively) |

---

## 11. Testing Requirements Per Module

### 11.1 Vest Firmware Tests

| Test | Pass Criteria |
|---|---|
| Sensor distance accuracy | ±5cm at 30cm, ±10cm at 100cm, vs. tape measure |
| PWM output mapping | Oscilloscope confirms correct duty cycle per zone table (§3.4) |
| BLE advertising | Discovered by Android BLE scanner within 3s of power-on |
| Characteristic 1 notify rate | 10 notifications/second ± 1 |
| Haptic override application | Override applied within 100ms of BLE write |
| Override timer expiry | Normal distance-based vibration resumes at exactly 2000ms |
| Sensor cross-talk | No zone contamination when all 3 sensors polled simultaneously |
| Battery status reporting | Char3 updates correctly at 15% and 5% thresholds |
| Reconnection after drop | Reconnects and resumes notifications within 10s |

### 11.2 Android App Tests

| Test | Pass Criteria |
|---|---|
| BLE scan → connect → subscribe | Completes in < 5s from app launch |
| Sensor data parsing | Correct L/C/R extraction from 1000 random valid payloads |
| Zone classification | Bounding box at X=0.1 → left; X=0.5 → center; X=0.9 → right |
| Haptic override construction | Correct 3-byte payloads for all 9 (zone × tier) combinations |
| TTS trigger on watch command | Speech begins within 2s of `[0x01]` received |
| Scene formatter output | All 6 example sentences from §8.2 match expected output |
| Foreground service persistence | App survives 10min background with screen off and BLE active |
| Reconnection | Reconnects to vest within 15s of simulated drop |
| Frame throttling | ML Kit runs at ≤ 12fps measured via logging |

### 11.3 WearOS App Tests

| Test | Pass Criteria |
|---|---|
| BLE advertising | Discovered by Android within 5s |
| Button tap → BLE write | Write delivered within 200ms (BLE callback) |
| Haptic on tap | Vibration confirmed tactilely on every tap |
| Connection status indicator | Green dot within 3s of phone connecting; red within 5s of disconnect |
| Full-screen tap area | Any tap point on screen triggers the action (test 20 points) |

---

## 12. Build & Delivery Checklist

### For each module, the AI agent must deliver:

**Module A (Vest Firmware)**
- [ ] Source code in `module-a-vest/src/`
- [ ] NuttX `.config` file
- [ ] `README.md` with build steps, flash instructions, and pin mapping
- [ ] Binary `.bin` file if buildable in CI
- [ ] Hardware schematic (ASCII or KiCad) for MOSFET driver circuit

**Module B (Android App)**
- [ ] React Native project in `module-b-android/`
- [ ] `README.md` with `yarn install`, native module linking, and build steps
- [ ] `.env.example` with any required config values
- [ ] Debug APK (or build script)
- [ ] All BLE constants in a single `src/ble/constants.ts` file (no UUID hardcoding elsewhere)

**Module C (WearOS App)**
- [ ] Android Studio project in `module-c-wearos/`
- [ ] `README.md` with build and sideload instructions
- [ ] Signed or unsigned `.apk` for WearOS
- [ ] All BLE constants matching `module-b-android/src/ble/constants.ts` exactly

### Integration Checklist (run after all three are built)
- [ ] Flash vest firmware, power on → BLE advertising visible in nRF Connect app
- [ ] Install Android app, launch → connects to vest within 5s
- [ ] Subscribe to Characteristic 1 → sensor data updating at 10Hz in debug log
- [ ] Hold hand 40cm from center sensor → center motor vibrates at "fast pulse"
- [ ] Install WearOS app → green dot appears on watch and phone
- [ ] Press watch button → TTS announces scene within 2s
- [ ] Simulate ML Kit detecting "person" at center → unique heartbeat vibration on center motor
- [ ] Kill vest power → TTS announces disconnect; vest re-powers, auto-reconnects
- [ ] Full 8-hour endurance test on vest

---

## Appendix A — Suggested Future Enhancements (Post-MVP)

| Feature | Complexity | Value |
|---|---|---|
| GPS + turn-by-turn routing via TTS | High | Very High |
| Custom wake word ("Hey Aura") instead of watch | Medium | High |
| Sound event detection (car horn, dog bark) | Medium | High |
| Depth estimation camera (replace ultrasonic) | High | High |
| Companion caregiver app (remote status view) | Medium | Medium |
| Cloud-synced obstacle map (crowdsourced) | Very High | Medium |
| Offline on-device LLM for richer descriptions | High | Medium |

## Appendix B — Key References

- NuttX Documentation: https://nuttx.apache.org/docs/latest/
- HC-SR04 Datasheet: Timing diagram, min trigger pulse 10µs
- React Native Vision Camera v4: https://react-native-vision-camera.com
- ML Kit Object Detection: https://developers.google.com/ml-kit/vision/object-detection
- BLE GATT Spec: Bluetooth Core Spec 5.3, Vol 3, Part G
- WearOS BLE Guide: https://developer.android.com/training/wearables/bluetooth
