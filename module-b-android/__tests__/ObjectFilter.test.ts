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

  it('drops scene-only labels instead of speaking them as objects', () => {
    const detections = filterDetections(
      [
        {
          label: 'Sky',
          confidence: 0.92,
          boundingBox: { x: 0, y: 0, width: 120, height: 120 },
        },
      ],
      120,
      120,
    );

    expect(detections).toHaveLength(0);
  });

  it('uses actionable alternatives before scene-only labels', () => {
    const [detection] = filterDetections(
      [
        {
          label: 'Sky',
          confidence: 0.92,
          alternativeLabels: [
            { text: 'Sky', confidence: 0.92 },
            { text: 'Chair', confidence: 0.62 },
          ],
          boundingBox: { x: 20, y: 20, width: 40, height: 40 },
        },
      ],
      120,
      120,
    );

    expect(detection?.label).toBe('chair');
  });

  it('drops activity labels instead of treating them like objects', () => {
    const detections = filterDetections(
      [
        {
          label: 'Sitting',
          confidence: 0.92,
          boundingBox: { x: 0, y: 0, width: 120, height: 120 },
        },
      ],
      120,
      120,
    );

    expect(detections).toHaveLength(0);
  });

  it('prefers concrete alternatives over activity labels', () => {
    const [detection] = filterDetections(
      [
        {
          label: 'Sitting',
          confidence: 0.92,
          alternativeLabels: [
            { text: 'Sitting', confidence: 0.92 },
            { text: 'Chair', confidence: 0.82 },
          ],
          boundingBox: { x: 20, y: 20, width: 40, height: 40 },
        },
      ],
      120,
      120,
    );

    expect(detection?.label).toBe('chair');
  });
});
