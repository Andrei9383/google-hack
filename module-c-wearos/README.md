# Aura WearOS Trigger

This module implements the watch-side trigger for Project Aura as a WearOS 3+ app.

## What It Does

- Advertises the shared Aura watch BLE service.
- Exposes the trigger characteristic using the same UUIDs as the Android phone app.
- Shows a dedicated `SPEAK OBJECTS` button on the watch face.
- Sends `[0x01]` to the phone whenever the user presses the button or shakes their wrist.
- Vibrates for 80ms on every trigger.
- Shows a connection status message and dot so you can confirm the phone has subscribed.

When the phone receives the trigger, the React Native app speaks the latest scene description built from the current camera detections and vest sensor data.

## Practical BLE Note

The written specification describes the watch trigger characteristic as write-only while also requiring the phone to subscribe to it. GATT does not allow a peripheral to write to a central that way, so this implementation keeps the UUID and payload contract but exposes the trigger characteristic as `READ | NOTIFY`. The phone subscribes, and the watch notifies `[0x01]` when the user presses the button or shakes.

## Requirements

- Android Studio Hedgehog or newer
- Android SDK 34 with platform tools on your machine
- WearOS emulator or a physical watch running WearOS 3.0+
- Either a local Gradle installation or a generated Gradle wrapper in this folder
- The phone app from `module-b-android` installed on an Android phone with Bluetooth and camera permissions granted

## Build

1. Create `local.properties` in this folder if it does not exist:

```properties
sdk.dir=/absolute/path/to/Android/Sdk
```

2. Create `local.properties` if needed. For example:

```properties
sdk.dir=/home/your-user/Android/Sdk
```

3. Build the debug APK using one of these options.

If this module has its own Gradle wrapper:

```bash
cd module-c-wearos
./gradlew assembleDebug
```

If this module does not have a wrapper but `module-b-android/android/gradlew` exists, you can reuse that wrapper:

```bash
cd module-c-wearos
../module-b-android/android/gradlew -p "$PWD" assembleDebug
```

If neither wrapper exists, generate one once with a local Gradle install:

```bash
cd module-c-wearos
gradle wrapper
```

Then build with:

```bash
cd module-c-wearos
./gradlew assembleDebug
```

## Upload To A Watch

### Emulator

1. Start the WearOS emulator from Android Studio Device Manager.
2. Install the app:

```bash
cd module-c-wearos
./gradlew installDebug
```

### Physical watch

1. Enable developer options and `ADB debugging` on the watch.
2. If you are using Wi-Fi debugging, pair and connect first:

```bash
adb pair WATCH_IP:PAIR_PORT
adb connect WATCH_IP:DEBUG_PORT
```

3. Confirm the device is visible:

```bash
adb devices
```

4. Install the APK with either Gradle or `adb`.

If `adb devices` shows the same watch twice, target the network serial explicitly:

```bash
adb -s WATCH_IP:DEBUG_PORT install -r app/build/outputs/apk/debug/app-debug.apk
```

Examples use the serial from the `adb connect` step, such as `10.41.93.9:33135`.

5. Install with Gradle or `adb`:

```bash
cd module-c-wearos
./gradlew installDebug
```

or, if you are reusing the phone app wrapper:

```bash
cd module-c-wearos
../module-b-android/android/gradlew -p "$PWD" installDebug
```

or

```bash
cd module-c-wearos
adb -s WATCH_IP:DEBUG_PORT install -r app/build/outputs/apk/debug/app-debug.apk
```

## Test The End-To-End Flow

1. Install and launch the phone app from `module-b-android` on an Android phone.
2. Grant Bluetooth and camera permissions on the phone.
3. Keep the phone app open so the camera preview is actively updating detections.
4. Launch `Aura Trigger` on the watch and accept the Bluetooth permissions prompt.
5. Wait for the watch to show `Phone connected` and the green status dot.
6. Point the phone camera at a few obvious objects.
7. Press `SPEAK OBJECTS` on the watch.
8. Confirm the phone speaks the objects currently in view.
9. Repeat with an empty scene and confirm the phone says `Nothing detected.` or the closest-obstacle fallback.
10. Shake the watch and confirm it triggers the same spoken result.

## Useful Commands

```bash
cd module-c-wearos
./gradlew assembleDebug
./gradlew installDebug
./gradlew test
```

If you are reusing the phone wrapper instead, replace those commands with `../module-b-android/android/gradlew -p "$PWD" ...`.