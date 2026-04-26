import { BleManager, Device, State, type Characteristic, type Subscription } from 'react-native-ble-plx';

import {
  AURA_DEVICE_NAMES,
  BLE_RECONNECT_BACKOFF_MS,
  BLE_SIGNAL_TIMEOUT_MS,
  WATCH_SERVICE_UUID,
  WATCH_TRIGGER_CHARACTERISTIC_UUID,
  VEST_HAPTIC_PATH,
  VEST_POLL_INTERVAL_MS,
  VEST_REQUEST_TIMEOUT_MS,
  VEST_STATE_PATH,
} from '../ble/constants';
import {
  buildHapticOverride,
  parseSensorPayload,
  parseStatusPayload,
  type AuraZone,
  type HapticTier,
  type VestSensorData,
  type VestStatusCode,
} from '../ble/VestProtocol';
import { isWatchTrigger } from '../ble/WatchProtocol';

interface ConnectivityCallbacks {
  onVestSensorData: (sensorData: VestSensorData) => void;
  onVestStatus: (status: VestStatusCode) => void;
  onVestConnectionChange: (connected: boolean) => void;
  onWatchConnectionChange: (connected: boolean) => void;
  onWatchTrigger: () => void;
  onError: (message: string) => void;
}

type DeviceRole = 'watch';

type VestStateObjectResponse = {
  sensorPayload?: unknown;
  sensor?: {
    left?: unknown;
    center?: unknown;
    right?: unknown;
  };
  status?: unknown;
};
type VestStateResponse = VestStateObjectResponse | unknown[];

const VEST_FAILURES_BEFORE_DISCONNECT = 3;
const VEST_HAPTIC_RETRY_DELAYS_MS = [0, 140, 320] as const;

function normalizeUuid(uuid: string): string {
  return uuid.toLowerCase();
}

function normalizeVestBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim();

  if (!trimmed) {
    return '';
  }

  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;

  return withProtocol.replace(/\/+$/, '');
}

function coerceByte(value: unknown, fieldName: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Vest WiFi response is missing numeric ${fieldName}.`);
  }

  return Math.max(0, Math.min(255, Math.round(value)));
}

function isVestStateObject(response: VestStateResponse): response is VestStateObjectResponse {
  return typeof response === 'object' && response !== null && !Array.isArray(response);
}

function vestSensorPayloadSource(response: VestStateResponse): unknown[] {
  if (Array.isArray(response)) {
    return response;
  }

  if (Array.isArray(response.sensorPayload)) {
    return response.sensorPayload;
  }

  return [response.sensor?.left, response.sensor?.center, response.sensor?.right];
}

async function requestJson<T>(url: string, init?: RequestInit, timeoutMs = BLE_SIGNAL_TIMEOUT_MS): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  try {
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error(`Timed out reaching ${url}.`));
      }, timeoutMs);
    });

    const response = await Promise.race([fetch(url, init), timeoutPromise]);

    if (!(response instanceof Response)) {
      throw new Error(`Unexpected response for ${url}.`);
    }

    if (!response.ok) {
      throw new Error(`Vest WiFi request failed with HTTP ${response.status}.`);
    }

    return (await response.json()) as T;
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

export class AuraConnectivityManager {
  private readonly manager = new BleManager();
  private readonly subscriptions: Subscription[] = [];
  private readonly reconnectTimers: Partial<Record<DeviceRole, ReturnType<typeof setTimeout>>> = {};
  private readonly reconnectAttempts: Record<DeviceRole, number> = {
    watch: 0,
  };

  private watchDevice: Device | null = null;
  private vestPollTimer: ReturnType<typeof setInterval> | null = null;
  private vestPollInFlight = false;
  private consecutiveVestFailures = 0;
  private lastVestConnected = false;
  private lastWatchConnected = false;
  private lastVestStatus: VestStatusCode | null = null;
  private lastErrorMessage: string | null = null;

  constructor(
    private readonly callbacks: ConnectivityCallbacks,
    private readonly vestBaseUrl: string,
  ) {}

  start() {
    const stateSubscription = this.manager.onStateChange((state) => {
      if (state === State.PoweredOn) {
        this.scanForWatch();
      }
    }, true);

    this.subscriptions.push(stateSubscription);
    void this.pollVestState();
    this.vestPollTimer = setInterval(() => {
      void this.pollVestState();
    }, VEST_POLL_INTERVAL_MS);
  }

  async sendHapticOverride(zone: AuraZone, tier: HapticTier): Promise<boolean> {
    return this.sendHapticPayload(buildHapticOverride(zone, tier));
  }

  async sendHapticPayload(payload: Uint8Array): Promise<boolean> {
    const baseUrl = normalizeVestBaseUrl(this.vestBaseUrl);

    if (!baseUrl) {
      return false;
    }

    let lastError: unknown = null;

    for (const delayMs of VEST_HAPTIC_RETRY_DELAYS_MS) {
      if (delayMs > 0) {
        await delay(delayMs);
      }

      try {
        await requestJson(
          `${baseUrl}${VEST_HAPTIC_PATH}`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Accept: 'application/json',
            },
            body: JSON.stringify({
              motorId: payload[0],
              intensity: payload[1],
              pattern: payload[2],
            }),
          },
          VEST_REQUEST_TIMEOUT_MS,
        );

        return true;
      } catch (error) {
        lastError = error;
      }
    }

    this.reportError(getConnectivityErrorMessage(lastError));
    return false;
  }

  destroy() {
    this.manager.stopDeviceScan();

    if (this.vestPollTimer) {
      clearInterval(this.vestPollTimer);
      this.vestPollTimer = null;
    }

    for (const timer of Object.values(this.reconnectTimers)) {
      if (timer) {
        clearTimeout(timer);
      }
    }

    for (const subscription of this.subscriptions) {
      subscription.remove();
    }

    this.manager.destroy();
  }

  private scanForWatch() {
    this.manager.stopDeviceScan();

    this.manager.startDeviceScan([WATCH_SERVICE_UUID], null, (error, device) => {
      if (error) {
        this.reportError(error.message);
        return;
      }

      if (!device || this.watchDevice) {
        return;
      }

      const advertisedServices = device.serviceUUIDs?.map(normalizeUuid) ?? [];
      const deviceName = device.localName ?? device.name ?? '';

      if (
        advertisedServices.includes(normalizeUuid(WATCH_SERVICE_UUID)) ||
        deviceName.includes(AURA_DEVICE_NAMES.watch)
      ) {
        void this.connectWatch(device);
      }
    });
  }

  private async connectWatch(device: Device) {
    try {
      const connected = await device.connect({ timeout: 10000 });
      await connected.discoverAllServicesAndCharacteristics();
      this.watchDevice = connected;
      this.reconnectAttempts.watch = 0;
      this.updateWatchConnection(true);
      this.attachWatchMonitors(connected);
      this.attachDisconnectionMonitor(connected, 'watch');
      this.manager.stopDeviceScan();
    } catch (error) {
      this.reportError(getConnectivityErrorMessage(error));
      this.scheduleReconnect('watch');
    }
  }

  private attachWatchMonitors(device: Device) {
    const triggerSubscription = device.monitorCharacteristicForService(
      WATCH_SERVICE_UUID,
      WATCH_TRIGGER_CHARACTERISTIC_UUID,
      (error, characteristic) => {
        if (error) {
          this.reportError(error.message);
          return;
        }

        if (!characteristic?.value) {
          return;
        }

        const payload = decodeBleValue(characteristic.value);

        if (isWatchTrigger(payload)) {
          this.callbacks.onWatchTrigger();
        }
      },
    );

    this.subscriptions.push(triggerSubscription);
  }

  private attachDisconnectionMonitor(device: Device, role: DeviceRole) {
    const subscription = device.onDisconnected((error) => {
      if (error) {
        this.reportError(error.message);
      }

      this.watchDevice = null;
      this.updateWatchConnection(false);
      this.scheduleReconnect(role);
    });

    this.subscriptions.push(subscription);
  }

  private scheduleReconnect(role: DeviceRole) {
    const existingTimer = this.reconnectTimers[role];

    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const index = Math.min(this.reconnectAttempts[role], BLE_RECONNECT_BACKOFF_MS.length - 1);
    const delay = BLE_RECONNECT_BACKOFF_MS[index];

    this.reconnectAttempts[role] += 1;
    this.reconnectTimers[role] = setTimeout(() => {
      this.scanForWatch();
    }, delay);
  }

  private async pollVestState() {
    const baseUrl = normalizeVestBaseUrl(this.vestBaseUrl);

    if (!baseUrl) {
      this.consecutiveVestFailures = 0;
      this.updateVestConnection(false);
      return;
    }

    if (this.vestPollInFlight) {
      return;
    }

    this.vestPollInFlight = true;

    try {
      const response = await requestJson<VestStateResponse>(
        `${baseUrl}${VEST_STATE_PATH}`,
        {
          headers: {
            Accept: 'application/json',
          },
        },
        VEST_REQUEST_TIMEOUT_MS,
      );

      const payloadSource = vestSensorPayloadSource(response);
      const sensorPayload = new Uint8Array([
        coerceByte(payloadSource[0], 'left sensor value'),
        coerceByte(payloadSource[1], 'center sensor value'),
        coerceByte(payloadSource[2], 'right sensor value'),
      ]);
      const statusPayload = new Uint8Array([
        coerceByte(isVestStateObject(response) ? response.status ?? 0x00 : 0x00, 'status'),
      ]);
      const status = parseStatusPayload(statusPayload);

      this.callbacks.onVestSensorData(parseSensorPayload(sensorPayload));

      if (status !== this.lastVestStatus) {
        this.lastVestStatus = status;
        this.callbacks.onVestStatus(status);
      }

      this.consecutiveVestFailures = 0;
      this.updateVestConnection(true);
      this.lastErrorMessage = null;
    } catch (error) {
      this.consecutiveVestFailures += 1;

      if (this.lastVestConnected && this.consecutiveVestFailures < VEST_FAILURES_BEFORE_DISCONNECT) {
        return;
      }

      this.updateVestConnection(false);
      this.reportError(getConnectivityErrorMessage(error));
    } finally {
      this.vestPollInFlight = false;
    }
  }

  private updateVestConnection(connected: boolean) {
    if (this.lastVestConnected === connected) {
      return;
    }

    this.lastVestConnected = connected;
    this.callbacks.onVestConnectionChange(connected);
  }

  private updateWatchConnection(connected: boolean) {
    if (this.lastWatchConnected === connected) {
      return;
    }

    this.lastWatchConnected = connected;
    this.callbacks.onWatchConnectionChange(connected);
  }

  private reportError(message: string) {
    if (!message || message === this.lastErrorMessage) {
      return;
    }

    this.lastErrorMessage = message;
    this.callbacks.onError(message);
  }
}

function getConnectivityErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return 'Unknown connectivity error.';
}

function decodeBleValue(value: string): Uint8Array {
  return new Uint8Array(Buffer.from(value, 'base64'));
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
