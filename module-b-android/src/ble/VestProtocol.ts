import { Buffer } from 'buffer';

export type AuraZone = 'left' | 'center' | 'right';
export type HapticTier = 'DANGER' | 'DYNAMIC' | 'STATIC';
export type VestStatusCode = 0x00 | 0x01 | 0x02 | 0x03;

export interface VestSensorData {
  left: number;
  center: number;
  right: number;
  timestamp: number;
}

export interface HapticCommand {
  zone: AuraZone;
  tier: HapticTier;
}

export const ZONE_TO_MOTOR_ID: Record<AuraZone, number> = {
  left: 0x01,
  center: 0x02,
  right: 0x03,
};

export const VEST_STATUS_LABELS: Record<VestStatusCode, string> = {
  0x00: 'OK',
  0x01: 'LOW_BATTERY',
  0x02: 'CRITICAL_BATTERY',
  0x03: 'SENSOR_FAULT',
};

export function buildHapticOverride(zone: AuraZone, tier: HapticTier): Uint8Array {
  const motorId = ZONE_TO_MOTOR_ID[zone];
  const intensity = { DANGER: 0xff, DYNAMIC: 0xb0, STATIC: 0x70 }[tier];
  const pattern = { DANGER: 0x02, DYNAMIC: 0x01, STATIC: 0x00 }[tier];

  return new Uint8Array([motorId, intensity, pattern]);
}

export function parseSensorPayload(payload: Uint8Array, timestamp = Date.now()): VestSensorData {
  if (payload.length !== 3) {
    throw new Error(`Vest sensor payload must be exactly 3 bytes, received ${payload.length}.`);
  }

  return {
    left: payload[0],
    center: payload[1],
    right: payload[2],
    timestamp,
  };
}

export function parseStatusPayload(payload: Uint8Array): VestStatusCode {
  if (payload.length !== 1) {
    throw new Error(`Vest status payload must be exactly 1 byte, received ${payload.length}.`);
  }

  return payload[0] as VestStatusCode;
}

export function encodeBleValue(value: Uint8Array): string {
  return Buffer.from(value).toString('base64');
}

export function decodeBleValue(value: string): Uint8Array {
  return new Uint8Array(Buffer.from(value, 'base64'));
}

export function zoneDistance(sensorData: VestSensorData, zone: AuraZone): number {
  return sensorData[zone];
}