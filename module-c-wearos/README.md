# Aura WearOS Trigger

This module implements the watch trigger for Project Aura as a WearOS 3+ app.

## What It Does

- Advertises the shared Aura watch BLE service.
- Exposes the trigger characteristic using the same UUIDs as the Android phone app.
- Uses BLE notifications to send `[0x01]` to the phone on tap or shake.
- Vibrates for 80ms on every trigger.
- Shows a single full-screen trigger surface with a connection status dot.

## Practical BLE Note

The written specification describes the watch trigger characteristic as write-only while also requiring the phone to subscribe to it. GATT does not allow a peripheral to write to a central that way, so this implementation keeps the UUID and payload contract but exposes the trigger characteristic as `READ | NOTIFY`. The phone subscribes, and the watch notifies `[0x01]` when the user taps or shakes.

## Build Requirements

- Android Studio Hedgehog or newer
- Android SDK 34
- WearOS emulator or device running WearOS 3.0+
- A generated Gradle wrapper or a local Gradle installation

## Build Steps

1. Create `local.properties` with your Android SDK path.
2. If you have Gradle installed locally, run `gradle wrapper` from this folder once.
3. Build with `./gradlew assembleDebug`.
4. Install with `./gradlew installDebug`.

## Validation

- `./gradlew assembleDebug`
- `./gradlew test`
- Connect the phone app and verify the status dot turns green.
- Tap anywhere on the watch screen and confirm a trigger notification is emitted.