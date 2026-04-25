# Aura Android App

This module implements the Android "brain" for Project Aura as an Expo development-build app.

## What Is Included

- BLE central logic for the vest and watch.
- Sensor fusion and scene formatting logic with unit tests.
- Accessible single-screen caregiver UI.
- Camera snapshot pipeline.
- Local Expo native module for Android ML Kit object detection and foreground service support.
- Graceful fallback when the native module is unavailable.

## Key Files

- `src/ble/constants.ts`: all UUIDs and BLE timing constants.
- `src/app/useAuraSystem.ts`: system orchestration.
- `src/vision/CameraProcessor.tsx`: snapshot camera loop.
- `modules/aura-native/`: local Expo native module.

## Environment

- Node 20+
- Android Studio / Android SDK 34
- Expo CLI via `npx`

## Install

```sh
npm install
```

## Build And Run

1. Generate or refresh the Android native project:

```sh
npx expo prebuild --platform android
```

2. Run on a connected device or emulator:

```sh
npm run android
```

## Validation

```sh
npm run typecheck
npm test
npx expo prebuild --platform android --no-install
```

## Permissions

The app requests:

- Bluetooth scan/connect/advertise
- Camera
- Foreground service
- Wake lock
- Fine location for Android BLE scanning compatibility

## Native Module Notes

The local Expo module lives in `modules/aura-native/` and exposes:

- `detectObjectsAsync(uri)`
- `startForegroundServiceAsync(title, description)`
- `stopForegroundServiceAsync()`

On Android, it uses ML Kit object detection and a foreground notification service. On web and iOS it resolves to no-op fallbacks so the JS layer still runs.

## Demo Configuration

`.env.example` contains the public vision-mode variable used for local configuration.