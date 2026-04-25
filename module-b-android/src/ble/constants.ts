export const WATCH_SERVICE_UUID = '2E6A0004-C4B2-4D6E-A591-7F8B2D3E1A00';
export const WATCH_TRIGGER_CHARACTERISTIC_UUID = '2E6A0005-C4B2-4D6E-A591-7F8B2D3E1A00';

export const BLE_RECONNECT_BACKOFF_MS = [1000, 2000, 4000, 8000, 16000, 30000] as const;
export const BLE_SIGNAL_TIMEOUT_MS = 5000;
export const DEFAULT_VEST_BASE_URL = '';
export const VEST_STATE_PATH = '/api/v1/state';
export const VEST_HAPTIC_PATH = '/api/v1/haptic';
export const VEST_POLL_INTERVAL_MS = 500;
export const VEST_REQUEST_TIMEOUT_MS = 2500;
export const VISION_CONFIDENCE_THRESHOLD = 0.65;

export const AURA_DEVICE_NAMES = {
  watch: 'AURA Watch',
} as const;