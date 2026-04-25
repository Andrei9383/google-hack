# Aura Android App

This is the Android app for Project Aura.

Current transport split:

- Vest: WiFi HTTP to the Sparrow board
- Watch: BLE, unchanged from the working watch implementation

iOS is intentionally out of scope here.

## What Is Included

- WiFi vest polling and haptic override delivery
- BLE watch trigger handling
- Sensor fusion and scene formatting logic with unit tests
- Accessible single-screen status UI
- Camera snapshot pipeline
- Local Expo native module for Android ML Kit object detection and foreground service support

## Key Files

- `src/connectivity/AuraConnectivityManager.ts`: hybrid vest WiFi plus watch BLE transport layer
- `src/app/useAuraSystem.ts`: system orchestration
- `src/ui/StatusScreen.tsx`: caregiver UI including vest URL entry
- `src/vision/CameraProcessor.tsx`: snapshot camera loop
- `modules/aura-native/`: Android native module

## Environment

- Node 20+
- Android Studio / Android SDK 34
- Expo CLI via `npx`

## Install

```sh
npm install
```

## Build And Run On Android

1. Generate or refresh the Android native project:

   ```sh
   npx expo prebuild --platform android
   ```

2. Run on a connected Android device:

   ```sh
   npm run android
   ```

3. Grant camera and Bluetooth permissions when prompted.

4. On the main screen, enter the Sparrow vest URL in this format:

   ```text
   http://<sparrow-ip>:8080
   ```

5. Tap `APPLY VEST URL`.

## Validation

```sh
npm run typecheck
npm test
npx expo prebuild --platform android --no-install
```

## Permissions

The app still requests:

- Bluetooth scan/connect for the watch
- Camera
- Foreground service
- Wake lock
- Fine location for Android BLE scanning compatibility

The vest itself no longer uses BLE.

## Native Module Notes

The local Expo module exposes:

- `detectObjectsAsync(uri)`
- `startForegroundServiceAsync(title, description)`
- `stopForegroundServiceAsync()`

On Android it uses ML Kit object detection and a foreground service notification.