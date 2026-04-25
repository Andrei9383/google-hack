import { Buffer } from 'buffer';
import { BleManager, Device, State, type Characteristic, type Subscription } from 'react-native-ble-plx';

import {
  AURA_DEVICE_NAMES,
  BLE_RECONNECT_BACKOFF_MS,
  VEST_HAPTIC_CHARACTERISTIC_UUID,
  VEST_SENSOR_CHARACTERISTIC_UUID,
  VEST_SERVICE_UUID,
  VEST_STATUS_CHARACTERISTIC_UUID,
  WATCH_SERVICE_UUID,
  WATCH_TRIGGER_CHARACTERISTIC_UUID,
} from './constants';
import {
  buildHapticOverride,
  decodeBleValue,
  parseSensorPayload,
  parseStatusPayload,
  type AuraZone,
  type HapticTier,
  type VestSensorData,
  type VestStatusCode,
} from './VestProtocol';
import { isWatchTrigger } from './WatchProtocol';

interface BLEManagerCallbacks {
  onVestSensorData: (sensorData: VestSensorData) => void;
  onVestStatus: (status: VestStatusCode) => void;
  onVestConnectionChange: (connected: boolean) => void;
  onWatchConnectionChange: (connected: boolean) => void;
  onWatchTrigger: () => void;
  onError: (message: string) => void;
}

type DeviceRole = 'vest' | 'watch';

function normalizeUuid(uuid: string): string {
  return uuid.toLowerCase();
}

export class AuraBleManager {
  private readonly manager = new BleManager();
  private readonly subscriptions: Subscription[] = [];
  private readonly reconnectTimers: Partial<Record<DeviceRole, ReturnType<typeof setTimeout>>> = {};
  private readonly reconnectAttempts: Record<DeviceRole, number> = {
    vest: 0,
    watch: 0,
  };

  private vestDevice: Device | null = null;
  private watchDevice: Device | null = null;

  constructor(private readonly callbacks: BLEManagerCallbacks) {}

  start() {
    const stateSubscription = this.manager.onStateChange((state) => {
      if (state === State.PoweredOn) {
        this.scanForDevices();
      } else {
        this.callbacks.onError('Bluetooth is not powered on.');
      }
    }, true);

    this.subscriptions.push(stateSubscription);
  }

  async connectBoard() {
    try {
      const state = await this.manager.state();

      if (state !== State.PoweredOn) {
        this.callbacks.onError('Turn on Bluetooth to connect the Aura board.');
        return;
      }

      this.scanForDevices();
    } catch (error) {
      this.callbacks.onError(getBleErrorMessage(error));
    }
  }

  async sendHapticOverride(zone: AuraZone, tier: HapticTier) {
    if (!this.vestDevice) {
      return;
    }

    const payload = buildHapticOverride(zone, tier);

    try {
      await this.vestDevice.writeCharacteristicWithoutResponseForService(
        VEST_SERVICE_UUID,
        VEST_HAPTIC_CHARACTERISTIC_UUID,
        Buffer.from(payload).toString('base64'),
      );
    } catch (error) {
      this.callbacks.onError(getBleErrorMessage(error));
    }
  }

  destroy() {
    this.manager.stopDeviceScan();

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

  private scanForDevices() {
    this.manager.stopDeviceScan();

    this.manager.startDeviceScan(null, null, (error, device) => {
      if (error) {
        this.callbacks.onError(error.message);
        return;
      }

      if (!device) {
        return;
      }

      const advertisedServices = device.serviceUUIDs?.map(normalizeUuid) ?? [];
      const deviceName = device.localName ?? device.name ?? '';

      if (
        !this.vestDevice &&
        (advertisedServices.includes(normalizeUuid(VEST_SERVICE_UUID)) ||
          deviceName.includes(AURA_DEVICE_NAMES.vest))
      ) {
        void this.connectVest(device);
      }

      if (
        !this.watchDevice &&
        (advertisedServices.includes(normalizeUuid(WATCH_SERVICE_UUID)) ||
          deviceName.includes(AURA_DEVICE_NAMES.watch))
      ) {
        void this.connectWatch(device);
      }

      if (this.vestDevice && this.watchDevice) {
        this.manager.stopDeviceScan();
      }
    });
  }

  private async connectVest(device: Device) {
    try {
      const connected = await device.connect({ timeout: 10000 });
      await connected.discoverAllServicesAndCharacteristics();
      this.vestDevice = connected;
      this.reconnectAttempts.vest = 0;
      this.callbacks.onVestConnectionChange(true);
      this.attachVestMonitors(connected);
      this.attachDisconnectionMonitor(connected, 'vest');
    } catch (error) {
      this.callbacks.onError(getBleErrorMessage(error));
      this.scheduleReconnect('vest');
    }
  }

  private async connectWatch(device: Device) {
    try {
      const connected = await device.connect({ timeout: 10000 });
      await connected.discoverAllServicesAndCharacteristics();
      this.watchDevice = connected;
      this.reconnectAttempts.watch = 0;
      this.callbacks.onWatchConnectionChange(true);
      this.attachWatchMonitors(connected);
      this.attachDisconnectionMonitor(connected, 'watch');
    } catch (error) {
      this.callbacks.onError(getBleErrorMessage(error));
      this.scheduleReconnect('watch');
    }
  }

  private attachVestMonitors(device: Device) {
    const sensorSubscription = device.monitorCharacteristicForService(
      VEST_SERVICE_UUID,
      VEST_SENSOR_CHARACTERISTIC_UUID,
      (error, characteristic) => {
        this.handleVestSensorCharacteristic(error, characteristic);
      },
    );

    const statusSubscription = device.monitorCharacteristicForService(
      VEST_SERVICE_UUID,
      VEST_STATUS_CHARACTERISTIC_UUID,
      (error, characteristic) => {
        this.handleVestStatusCharacteristic(error, characteristic);
      },
    );

    this.subscriptions.push(sensorSubscription, statusSubscription);
  }

  private attachWatchMonitors(device: Device) {
    const triggerSubscription = device.monitorCharacteristicForService(
      WATCH_SERVICE_UUID,
      WATCH_TRIGGER_CHARACTERISTIC_UUID,
      (error, characteristic) => {
        if (error) {
          this.callbacks.onError(error.message);
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
        this.callbacks.onError(error.message);
      }

      if (role === 'vest') {
        this.vestDevice = null;
        this.callbacks.onVestConnectionChange(false);
      } else {
        this.watchDevice = null;
        this.callbacks.onWatchConnectionChange(false);
      }

      this.scheduleReconnect(role);
    });

    this.subscriptions.push(subscription);
  }

  private handleVestSensorCharacteristic(error: Error | null, characteristic: Characteristic | null) {
    if (error) {
      this.callbacks.onError(error.message);
      return;
    }

    if (!characteristic?.value) {
      return;
    }

    const payload = decodeBleValue(characteristic.value);
    const sensorData = parseSensorPayload(payload);
    this.callbacks.onVestSensorData(sensorData);
  }

  private handleVestStatusCharacteristic(error: Error | null, characteristic: Characteristic | null) {
    if (error) {
      this.callbacks.onError(error.message);
      return;
    }

    if (!characteristic?.value) {
      return;
    }

    const payload = decodeBleValue(characteristic.value);
    this.callbacks.onVestStatus(parseStatusPayload(payload));
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
      this.scanForDevices();
    }, delay);
  }
}

function getBleErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return 'Unknown Bluetooth error.';
}
