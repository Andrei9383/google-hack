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

function getDeviceNames(device: Device): string[] {
  return [device.localName, device.name].flatMap((value) => {
    if (!value) {
      return [];
    }

    const normalized = value.trim();
    return normalized ? [normalized] : [];
  });
}

function matchesDeviceName(deviceNames: string[], expectedNames: string[]): boolean {
  return deviceNames.some((deviceName) =>
    expectedNames.some((expectedName) => deviceName.toLowerCase().includes(expectedName.toLowerCase())),
  );
}

function matchesVest(device: Device): boolean {
  const advertisedServices = device.serviceUUIDs?.map(normalizeUuid) ?? [];
  const deviceNames = getDeviceNames(device);

  return (
    advertisedServices.includes(normalizeUuid(VEST_SERVICE_UUID)) ||
    matchesDeviceName(deviceNames, [AURA_DEVICE_NAMES.vest])
  );
}

function matchesWatch(device: Device): boolean {
  const advertisedServices = device.serviceUUIDs?.map(normalizeUuid) ?? [];
  const deviceNames = getDeviceNames(device);

  return (
    advertisedServices.includes(normalizeUuid(WATCH_SERVICE_UUID)) ||
    matchesDeviceName(deviceNames, [AURA_DEVICE_NAMES.watch, 'Pixel Watch'])
  );
}

export class AuraBleManager {
  private readonly manager = new BleManager();
  private readonly subscriptions: Subscription[] = [];
  private readonly reconnectTimers: Partial<Record<DeviceRole, ReturnType<typeof setTimeout>>> = {};
  private readonly reconnectAttempts: Record<DeviceRole, number> = {
    vest: 0,
    watch: 0,
  };
  private readonly isConnecting: Record<DeviceRole, boolean> = {
    vest: false,
    watch: false,
  };
  private readonly suppressNextDisconnectError: Record<DeviceRole, boolean> = {
    vest: false,
    watch: false,
  };

  private vestDevice: Device | null = null;
  private watchDevice: Device | null = null;

  constructor(private readonly callbacks: BLEManagerCallbacks) {}

  start() {
    const stateSubscription = this.manager.onStateChange((state) => {
      if (state === State.PoweredOn) {
        this.scanForWatch();
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

      this.scanForVest();
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

      if (!this.vestDevice && matchesVest(device)) {
        void this.connectVest(device);
      }

      if (!this.watchDevice && matchesWatch(device)) {
        void this.connectWatch(device);
      }

      if (this.vestDevice && this.watchDevice) {
        this.manager.stopDeviceScan();
      }
    });
  }

  private scanForVest() {
    this.scanForRole('vest', [VEST_SERVICE_UUID], (device) => {
      void this.connectVest(device);
    });
  }

  private scanForWatch() {
    this.scanForRole('watch', [WATCH_SERVICE_UUID], (device) => {
      void this.connectWatch(device);
    });
  }

  private scanForRole(
    role: DeviceRole,
    serviceUuids: string[],
    connect: (device: Device) => void,
  ) {
    if (this.isConnecting[role]) {
      return;
    }

    if (role === 'vest' ? this.vestDevice : this.watchDevice) {
      return;
    }

    this.manager.stopDeviceScan();

    this.manager.startDeviceScan(serviceUuids, null, (error, device) => {
      if (error) {
        this.callbacks.onError(error.message);
        return;
      }

      if (!device) {
        return;
      }

      this.manager.stopDeviceScan();
      connect(device);
    });
  }

  private async connectVest(device: Device) {
    if (this.isConnecting.vest) {
      return;
    }

    this.isConnecting.vest = true;

    try {
      const connected = await device.connect({ timeout: 10000 });
      await connected.discoverAllServicesAndCharacteristics();
      this.vestDevice = connected;
      this.reconnectAttempts.vest = 0;
      this.callbacks.onVestConnectionChange(true);
      this.attachVestMonitors(connected);
      this.attachDisconnectionMonitor(connected, 'vest');

      if (!this.watchDevice) {
        this.scanForWatch();
      }
    } catch (error) {
      this.callbacks.onError(getBleErrorMessage(error));
      this.scheduleReconnect('vest');
    } finally {
      this.isConnecting.vest = false;
    }
  }

  private async connectWatch(device: Device) {
    if (this.isConnecting.watch) {
      return;
    }

    this.isConnecting.watch = true;

    try {
      const connected = await device.connect({ timeout: 10000 });
      await connected.discoverAllServicesAndCharacteristics();
      this.watchDevice = connected;
      this.reconnectAttempts.watch = 0;
      this.callbacks.onWatchConnectionChange(true);
      this.attachWatchMonitors(connected);
      this.attachDisconnectionMonitor(connected, 'watch');

      if (!this.vestDevice) {
        this.scanForVest();
      }
    } catch (error) {
      this.callbacks.onError(getBleErrorMessage(error));
      this.scheduleReconnect('watch');
    } finally {
      this.isConnecting.watch = false;
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
          if (isNotifyChangeFailure(error)) {
            this.handleWatchMonitorFailure(device);
            return;
          }

          this.callbacks.onError(getBleErrorMessage(error));
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

  private handleWatchMonitorFailure(device: Device) {
    this.watchDevice = null;
    this.callbacks.onWatchConnectionChange(false);
    this.scheduleReconnect('watch');
    this.suppressNextDisconnectError.watch = true;
    void device.cancelConnection().catch(() => undefined);
  }

  private attachDisconnectionMonitor(device: Device, role: DeviceRole) {
    const subscription = device.onDisconnected((error) => {
      if (error && !this.suppressNextDisconnectError[role]) {
        this.callbacks.onError(error.message);
      }
      this.suppressNextDisconnectError[role] = false;

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
      if (role === 'vest') {
        this.scanForVest();
      } else {
        this.scanForWatch();
      }
    }, delay);
  }
}

function getBleErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return 'Unknown Bluetooth error.';
}

function isNotifyChangeFailure(error: unknown): boolean {
  const message = getBleErrorMessage(error).toLowerCase();

  return message.includes('notify change failed');
}
