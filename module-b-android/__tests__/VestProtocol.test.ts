/// <reference types="jest" />

import {
  buildHapticOverride,
  decodeBleValue,
  encodeBleValue,
  parseSensorPayload,
  parseStatusPayload,
} from '../src/ble/VestProtocol';

describe('VestProtocol', () => {
  it.each([
    ['left', 'STATIC', [0x01, 0x70, 0x00]],
    ['left', 'DYNAMIC', [0x01, 0xb0, 0x01]],
    ['left', 'DANGER', [0x01, 0xff, 0x02]],
    ['center', 'STATIC', [0x02, 0x70, 0x00]],
    ['center', 'DYNAMIC', [0x02, 0xb0, 0x01]],
    ['center', 'DANGER', [0x02, 0xff, 0x02]],
    ['right', 'STATIC', [0x03, 0x70, 0x00]],
    ['right', 'DYNAMIC', [0x03, 0xb0, 0x01]],
    ['right', 'DANGER', [0x03, 0xff, 0x02]],
  ] as const)('builds %s %s payload', (zone, tier, expected) => {
    expect([...buildHapticOverride(zone, tier)]).toEqual(expected);
  });

  it('round-trips base64 BLE payloads', () => {
    const payload = new Uint8Array([0x01, 0x02, 0x03]);
    expect([...decodeBleValue(encodeBleValue(payload))]).toEqual([0x01, 0x02, 0x03]);
  });

  it('parses sensor data', () => {
    expect(parseSensorPayload(new Uint8Array([12, 55, 99]), 42)).toEqual({
      left: 12,
      center: 55,
      right: 99,
      timestamp: 42,
    });
  });

  it('parses status data', () => {
    expect(parseStatusPayload(new Uint8Array([0x03]))).toBe(0x03);
  });
});