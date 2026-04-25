import { create } from 'zustand';

import type { AuraZone, VestSensorData, VestStatusCode } from '../ble/VestProtocol';
import type { OverrideRecord } from '../fusion/SensorFusion';
import type { SceneDetection } from '../vision/ObjectFilter';

export type SystemMode =
  | 'booting'
  | 'scanning'
  | 'fully_active'
  | 'vest_only'
  | 'watch_only'
  | 'phone_only';

interface SystemStoreState {
  vestConnected: boolean;
  watchConnected: boolean;
  cameraActive: boolean;
  vestStatus: VestStatusCode;
  phoneBatteryLevel: number | null;
  vestSensorData: VestSensorData;
  detections: SceneDetection[];
  lastScene: string;
  lastError: string | null;
  systemMode: SystemMode;
  lastOverrides: Partial<Record<AuraZone, OverrideRecord>>;
  setVestConnected: (connected: boolean) => void;
  setWatchConnected: (connected: boolean) => void;
  setCameraActive: (active: boolean) => void;
  setVestStatus: (status: VestStatusCode) => void;
  setPhoneBatteryLevel: (level: number | null) => void;
  setVestSensorData: (sensorData: VestSensorData) => void;
  setDetections: (detections: SceneDetection[]) => void;
  setLastScene: (scene: string) => void;
  setLastError: (error: string | null) => void;
  setOverride: (zone: AuraZone, override: OverrideRecord) => void;
}

const INITIAL_SENSOR_DATA: VestSensorData = {
  left: 0xff,
  center: 0xff,
  right: 0xff,
  timestamp: 0,
};

export const useSystemStore = create<SystemStoreState>((set, get) => ({
  vestConnected: false,
  watchConnected: false,
  cameraActive: false,
  vestStatus: 0x00,
  phoneBatteryLevel: null,
  vestSensorData: INITIAL_SENSOR_DATA,
  detections: [],
  lastScene: 'Nothing detected.',
  lastError: null,
  systemMode: 'booting',
  lastOverrides: {},
  setVestConnected: (connected) => {
    set({ vestConnected: connected });
    syncMode(get, set);
  },
  setWatchConnected: (connected) => {
    set({ watchConnected: connected });
    syncMode(get, set);
  },
  setCameraActive: (active) => {
    set({ cameraActive: active });
    syncMode(get, set);
  },
  setVestStatus: (status) => set({ vestStatus: status }),
  setPhoneBatteryLevel: (level) => set({ phoneBatteryLevel: level }),
  setVestSensorData: (sensorData) => {
    set({ vestSensorData: sensorData, systemMode: 'scanning' });
    syncMode(get, set);
  },
  setDetections: (detections) => set({ detections }),
  setLastScene: (scene) => set({ lastScene: scene }),
  setLastError: (error) => set({ lastError: error }),
  setOverride: (zone, override) => {
    set((state) => ({
      lastOverrides: {
        ...state.lastOverrides,
        [zone]: override,
      },
    }));
  },
}));

function syncMode(get: () => SystemStoreState, set: (value: Partial<SystemStoreState>) => void) {
  const { vestConnected, watchConnected, cameraActive } = get();

  if (vestConnected && watchConnected && cameraActive) {
    set({ systemMode: 'fully_active' });
    return;
  }

  if (vestConnected && !watchConnected && !cameraActive) {
    set({ systemMode: 'vest_only' });
    return;
  }

  if (!vestConnected && watchConnected) {
    set({ systemMode: 'watch_only' });
    return;
  }

  if (!vestConnected && !watchConnected) {
    set({ systemMode: 'phone_only' });
    return;
  }

  set({ systemMode: 'scanning' });
}