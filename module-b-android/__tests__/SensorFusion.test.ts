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
  it('suppresses danger overrides when the vest is already at max intensity', () => {
    const result = fuseSensorData({
      vest: { left: 18, center: 255, right: 255 },
      mlkit: [makeDetection('left', 'DANGER')],
      now: 1000,
    });

    expect(result.hapticOverrides).toHaveLength(0);
  });

  it('sends danger overrides when sonar misses a hazard', () => {
    const result = fuseSensorData({
      vest: { left: 255, center: 255, right: 255 },
      mlkit: [makeDetection('center', 'DANGER')],
      now: 1000,
    });

    expect(result.hapticOverrides).toHaveLength(1);
    expect(result.hapticOverrides[0]?.zone).toBe('center');
    expect([...result.hapticOverrides[0]?.payload ?? []]).toEqual([0x02, 0xff, 0x02]);
  });

  it('suppresses duplicate overrides within 500ms', () => {
    const result = fuseSensorData({
      vest: { left: 120, center: 255, right: 255 },
      mlkit: [makeDetection('left', 'STATIC')],
      now: 1200,
      previousOverrides: {
        left: { tier: 'STATIC', timestamp: 900 },
      },
    });

    expect(result.hapticOverrides).toHaveLength(0);
  });
});