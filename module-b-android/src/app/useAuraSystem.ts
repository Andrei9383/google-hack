import * as Battery from 'expo-battery';
import { useEffect, useMemo, useRef } from 'react';
import { AppState } from 'react-native';

import { DEFAULT_VEST_BASE_URL } from '../ble/constants';
import {
  VEST_STATUS_LABELS,
  type AuraZone,
  type HapticTier,
  type VestStatusCode,
} from '../ble/VestProtocol';
import { AuraConnectivityManager } from '../connectivity/AuraConnectivityManager';
import { fuseSensorData } from '../fusion/SensorFusion';
import {
  hasNativeAuraModule,
  startForegroundServiceAsync,
  stopForegroundServiceAsync,
  type NativeDetectedObject,
} from '../native/AuraNative';
import { useSystemStore } from '../state/SystemStore';
import { formatSceneDescription } from '../tts/SceneFormatter';
import { speak } from '../tts/TTSEngine';
import { filterDetections } from '../vision/ObjectFilter';
import { useEventCallback } from './useEventCallback';

function announcementForVestStatus(status: VestStatusCode): string | null {
  switch (status) {
    case 0x01:
      return 'Vest battery low.';
    case 0x02:
      return 'Warning: vest battery critical.';
    case 0x03:
      return 'Warning: vest sensor fault. Check hardware.';
    default:
      return null;
  }
}

export function useAuraSystem(cameraGranted: boolean) {
  const connectivityManagerRef = useRef<AuraConnectivityManager | null>(null);
  const fusionInFlightRef = useRef(false);
  const fusionPendingRef = useRef(false);

  const setCameraActive = useSystemStore((state) => state.setCameraActive);
  const setPhoneBatteryLevel = useSystemStore((state) => state.setPhoneBatteryLevel);
  const setVestSensorData = useSystemStore((state) => state.setVestSensorData);
  const setVestStatus = useSystemStore((state) => state.setVestStatus);
  const setVestConnected = useSystemStore((state) => state.setVestConnected);
  const setWatchConnected = useSystemStore((state) => state.setWatchConnected);
  const setDetections = useSystemStore((state) => state.setDetections);
  const setLastScene = useSystemStore((state) => state.setLastScene);
  const setLastError = useSystemStore((state) => state.setLastError);
  const setOverride = useSystemStore((state) => state.setOverride);
  const vestBaseUrl = useSystemStore((state) => state.vestBaseUrl || DEFAULT_VEST_BASE_URL);

  const describeSceneNow = useEventCallback(async () => {
    const snapshot = useSystemStore.getState();
    const description = formatSceneDescription(snapshot.detections, snapshot.vestSensorData);
    snapshot.setLastScene(description);
    await speak(description, 'scene');
  });

  const sendVestTest = useEventCallback(async (zone: AuraZone, tier: HapticTier = 'DYNAMIC') => {
    const acknowledged = await connectivityManagerRef.current?.sendHapticOverride(zone, tier);

    if (acknowledged) {
      const intensity = { DANGER: 0xff, DYNAMIC: 0xb0, STATIC: 0x70 }[tier];
      const pattern = { DANGER: 0x02, DYNAMIC: 0x01, STATIC: 0x00 }[tier];

      setOverride(zone, { tier, intensity, pattern, timestamp: Date.now() });
      setLastError(null);
    }
  });

  const sendFusionCommands = useEventCallback(async () => {
    if (fusionInFlightRef.current) {
      fusionPendingRef.current = true;
      return;
    }

    fusionInFlightRef.current = true;

    try {
      do {
        fusionPendingRef.current = false;

        const snapshot = useSystemStore.getState();
        const fusionOutput = fuseSensorData({
          vest: snapshot.vestSensorData,
          mlkit: snapshot.detections,
          previousOverrides: snapshot.lastOverrides,
        });

        for (const override of fusionOutput.hapticOverrides) {
          const acknowledged = await connectivityManagerRef.current?.sendHapticPayload(override.payload);

          if (acknowledged) {
            setOverride(override.zone, {
              tier: override.tier,
              intensity: override.intensity,
              pattern: override.pattern,
              timestamp: Date.now(),
            });
            setLastError(null);
          }
        }
      } while (fusionPendingRef.current);
    } finally {
      fusionInFlightRef.current = false;
    }
  });

  const handleVisionDetections = useEventCallback(
    async (detections: NativeDetectedObject[], frameWidth: number, frameHeight: number) => {
      const filtered = filterDetections(detections, frameWidth, frameHeight);
      setDetections(filtered);

      if (filtered.length > 0) {
        const snapshot = useSystemStore.getState();

        setLastScene(formatSceneDescription(filtered, snapshot.vestSensorData));
      }

      await sendFusionCommands();
    },
  );

  const announceSystem = useEventCallback(async (message: string | null) => {
    if (!message) {
      return;
    }

    await speak(message, 'system');
  });

  const handleVisionError = useEventCallback((message: string) => {
    setLastError(message);
  });

  useEffect(() => {
    setCameraActive(cameraGranted);

    if (!cameraGranted) {
      void announceSystem('Camera unavailable. Haptic mode only.');
    }
  }, [announceSystem, cameraGranted, setCameraActive]);

  useEffect(() => {
    const connectivityManager = new AuraConnectivityManager({
      onVestSensorData: (sensorData) => {
        setVestSensorData(sensorData);
        setLastError(null);
        void sendFusionCommands();
      },
      onVestStatus: (status) => {
        setVestStatus(status);
        setLastError(null);
        void announceSystem(announcementForVestStatus(status));
      },
      onVestConnectionChange: (connected) => {
        setVestConnected(connected);
        void announceSystem(connected ? 'Vest connected.' : 'Vest disconnected. Reconnecting.');
      },
      onWatchConnectionChange: (connected) => {
        setWatchConnected(connected);
        void announceSystem(connected ? 'Watch connected.' : 'Watch disconnected.');
      },
      onWatchTrigger: () => {
        void describeSceneNow();
      },
      onError: (message) => {
        setLastError(message);
      },
    }, vestBaseUrl);

    connectivityManagerRef.current = connectivityManager;
    connectivityManager.start();
    void startForegroundServiceAsync('Aura active', 'Monitoring the WiFi vest and BLE watch.');

    const appStateSubscription = AppState.addEventListener('change', (status) => {
      if (status === 'active') {
        void announceSystem('Aura active.');
      }
    });

    const batterySubscription = Battery.addBatteryLevelListener((event) => {
      setPhoneBatteryLevel(Math.round(event.batteryLevel * 100));
    });

    void Battery.getBatteryLevelAsync().then((level) => {
      setPhoneBatteryLevel(Math.round(level * 100));
    });

    return () => {
      batterySubscription.remove();
      appStateSubscription.remove();
      connectivityManager.destroy();
      connectivityManagerRef.current = null;
      void stopForegroundServiceAsync();
    };
  }, [announceSystem, describeSceneNow, sendFusionCommands, setLastError, setPhoneBatteryLevel, setVestConnected, setVestSensorData, setVestStatus, setWatchConnected, vestBaseUrl]);

  useEffect(() => {
    if (!hasNativeAuraModule) {
      setLastError('Native Aura module not available. Running without ML Kit or foreground service.');
    }
  }, [setLastError]);

  return useMemo(
    () => ({
      describeSceneNow,
      handleVisionDetections,
      handleVisionError,
      sendVestTest,
      vestStatusLabel: VEST_STATUS_LABELS[useSystemStore.getState().vestStatus],
    }),
    [describeSceneNow, handleVisionDetections, handleVisionError, sendVestTest],
  );
}
