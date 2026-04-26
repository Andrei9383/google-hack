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
          boundingBox: { x: 0, y: 0, width: 10, height: 10 },
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
            { text: 'Chair', confidence: 0.72 },
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

  it('drops tiny tabletop-style objects that are not useful for navigation', () => {
    const detections = filterDetections(
      [
        {
          label: 'Tableware',
          confidence: 0.94,
          boundingBox: { x: 70, y: 30, width: 8, height: 8 },
        },
      ],
      160,
      120,
    );

    expect(detections).toHaveLength(0);
  });

  it('keeps close table objects when they fill enough of the view', () => {
    const [detection] = filterDetections(
      [
        {
          label: 'Cup',
          confidence: 0.91,
          boundingBox: { x: 30, y: 58, width: 70, height: 56 },
        },
      ],
      160,
      120,
    );

    expect(detection?.label).toBe('cup');
  });

  it('turns large generic object boxes into navigation obstacles', () => {
    const [detection] = filterDetections(
      [
        {
          label: 'Home good',
          confidence: 0.8,
          boundingBox: { x: 20, y: 20, width: 90, height: 70 },
        },
      ],
      160,
      120,
    );

    expect(detection?.label).toBe('obstacle');
  });
});
