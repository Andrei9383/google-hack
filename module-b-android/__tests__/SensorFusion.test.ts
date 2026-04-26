/// <reference types="jest" />

import { fuseSensorData } from '../src/fusion/SensorFusion';
import type { SceneDetection } from '../src/vision/ObjectFilter';

const baseDetection = {
  boundingBox: { x: 0, y: 0, width: 10, height: 10 },
  confidence: 0.9,
  label: 'person',
} as const;

function makeDetection(zone: SceneDetection['zone'], tier: SceneDetection['tier']): SceneDetection {
  return {
    ...baseDetection,
    zone,
    tier,
  };
}

describe('SensorFusion', () => {
  it('sends danger commands from ultrasonic readings even without vision', () => {
    const result = fuseSensorData({
      vest: { left: 18, center: 255, right: 255 },
      mlkit: [],
      now: 1000,
    });

    expect(result.hapticOverrides[0]?.zone).toBe('left');
    expect([...result.hapticOverrides[0]?.payload ?? []]).toEqual([0x01, 0xff, 0x02]);
  });

  it('sends danger overrides when sonar misses a hazard', () => {
    const result = fuseSensorData({
      vest: { left: 255, center: 255, right: 255 },
      mlkit: [makeDetection('center', 'DANGER')],
      now: 1000,
    });

    const centerOverride = result.hapticOverrides.find((override) => override.zone === 'center');

    expect(centerOverride).toBeDefined();
    expect([...centerOverride?.payload ?? []]).toEqual([0x02, 0xff, 0x02]);
  });

  it('sends clear commands so the app remains authoritative when the path is open', () => {
    const result = fuseSensorData({
      vest: { left: 255, center: 255, right: 255 },
      mlkit: [],
      now: 1000,
    });

    expect(result.hapticOverrides).toHaveLength(3);
    expect(result.hapticOverrides.map((override) => [...override.payload])).toEqual([
      [0x01, 0x00, 0x00],
      [0x02, 0x00, 0x00],
      [0x03, 0x00, 0x00],
    ]);
  });

  it('suppresses duplicate commands briefly but resends before vest overrides expire', () => {
    const result = fuseSensorData({
      vest: { left: 120, center: 255, right: 255 },
      mlkit: [],
      now: 1200,
      previousOverrides: {
        left: { tier: 'STATIC', intensity: 0x70, pattern: 0x00, timestamp: 900 },
        center: { tier: 'CLEAR', intensity: 0x00, pattern: 0x00, timestamp: 900 },
        right: { tier: 'CLEAR', intensity: 0x00, pattern: 0x00, timestamp: 900 },
      },
    });

    expect(result.hapticOverrides).toHaveLength(0);

    const resend = fuseSensorData({
      vest: { left: 120, center: 255, right: 255 },
      mlkit: [],
      now: 1900,
      previousOverrides: {
        left: { tier: 'STATIC', intensity: 0x70, pattern: 0x00, timestamp: 900 },
        center: { tier: 'CLEAR', intensity: 0x00, pattern: 0x00, timestamp: 900 },
        right: { tier: 'CLEAR', intensity: 0x00, pattern: 0x00, timestamp: 900 },
      },
    });

    expect(resend.hapticOverrides).toHaveLength(3);
  });
});
