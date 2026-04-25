/// <reference types="jest" />

import { filterDetections } from '../src/vision/ObjectFilter';

describe('ObjectFilter', () => {
  it('uses detailed image labels instead of coarse ML Kit object categories', () => {
    const [detection] = filterDetections(
      [
        {
          label: 'Home good',
          confidence: 0.66,
          alternativeLabels: [
            { text: 'Chair', confidence: 0.91 },
            { text: 'Home good', confidence: 0.88 },
          ],
          boundingBox: { x: 20, y: 20, width: 40, height: 40 },
        },
      ],
      120,
      120,
    );

    expect(detection?.label).toBe('chair');
    expect(detection?.zone).toBe('center');
  });

  it('drops generic labels when there is no better candidate', () => {
    const detections = filterDetections(
      [
        {
          label: 'Fashion good',
          confidence: 0.9,
          boundingBox: { x: 0, y: 0, width: 40, height: 40 },
        },
      ],
      120,
      120,
    );

    expect(detections).toHaveLength(0);
  });
});
