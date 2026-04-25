/// <reference types="jest" />

import { formatSceneDescription } from '../src/tts/SceneFormatter';
import type { SceneDetection } from '../src/vision/ObjectFilter';

function detection(
  label: string,
  zone: SceneDetection['zone'],
  confidence = 0.9,
): SceneDetection {
  return {
    label,
    confidence,
    zone,
    tier: label === 'person' ? 'DANGER' : 'STATIC',
    boundingBox: { x: 0, y: 0, width: 10, height: 10 },
  };
}

describe('SceneFormatter', () => {
  it('formats the primary scene example', () => {
    expect(
      formatSceneDescription(
        [detection('person', 'center'), detection('chair', 'left'), detection('chair', 'left')],
        { left: 130, center: 80, right: 255 },
      ),
    ).toBe('1 person ahead, 2 chairs to your left. Closest obstacle: 80cm center.');
  });

  it('formats the clear path example', () => {
    expect(
      formatSceneDescription([detection('table', 'right')], { left: 255, center: 130, right: 255 }),
    ).toBe('Clear path ahead. 1 table to your right.');
  });

  it('formats the crowded scene example', () => {
    expect(
      formatSceneDescription(
        [
          detection('person', 'center'),
          detection('person', 'center'),
          detection('person', 'left'),
          detection('chair', 'right'),
          detection('table', 'right'),
          detection('dog', 'left', 0.7),
        ],
        { left: 120, center: 45, right: 255 },
      ),
    ).toBe('3 people ahead and to the left, 1 chair to your right, 1 table to your right. and 1 other object. Closest obstacle: 45cm center.');
  });

  it('returns a fallback message when nothing is visible', () => {
    expect(formatSceneDescription([], { left: 255, center: 255, right: 255 })).toBe('Nothing detected.');
  });
});